from decimal import Decimal
from uuid import UUID

import pytest

from app.schemas.rental_quote import RentalQuoteRequest
from app.services.rental_quote_service import calculate_quote

ITEM_ID = '10000000-0000-0000-0000-000000000001'
GROUP_ID = '20000000-0000-0000-0000-000000000001'
ITEM = {'id': ITEM_ID, 'code': '+001', 'group': {'id': GROUP_ID, 'name': 'RACE'},
        'variant': {'brand': 'Marca', 'model': 'Modello', 'category': {'code': 'ski'}}}
RATE = {'group_id': GROUP_ID, 'daily_price_1_day': 20, 'daily_price_2_days': 18,
        'daily_price_3_days': 16, 'daily_price_4_days': 15, 'daily_price_5_days': 14,
        'daily_price_6_days': 12, 'daily_price_7_plus_days': 10}


@pytest.mark.parametrize('end,days,price,total', [
    ('2026-12-01', 1, '20', '20'), ('2026-12-02', 2, '18', '36'),
    ('2026-12-03', 3, '16', '48'), ('2026-12-07', 7, '10', '70'),
    ('2026-12-08', 8, '10', '80'), ('2026-12-15', 15, '10', '150'),
])
def test_inclusive_duration_and_daily_rate_for_whole_period(end, days, price, total):
    data = RentalQuoteRequest(starts_on='2026-12-01', ends_on=end, inventory_ids=[ITEM_ID])
    result = calculate_quote(data, [ITEM], [RATE], None)
    assert result.days == days
    assert result.items[0].daily_price == Decimal(price)
    assert result.total == Decimal(total)


def test_daylight_saving_does_not_change_calendar_day_count():
    data = RentalQuoteRequest(starts_on='2026-03-28', ends_on='2026-03-30', inventory_ids=[ITEM_ID])
    assert calculate_quote(data, [ITEM], [RATE], None).days == 3


def test_hotel_discount_and_cent_rounding_are_consistent():
    data = RentalQuoteRequest(starts_on='2026-12-01', ends_on='2026-12-03', inventory_ids=[ITEM_ID])
    hotel = {'id': GROUP_ID, 'name': 'Albergo', 'discount': 15}
    result = calculate_quote(data, [ITEM], [RATE], hotel)
    assert result.subtotal == Decimal('48')
    assert result.discount_amount == Decimal('7.20')
    assert result.total == Decimal('40.80')
    one_day = RentalQuoteRequest(starts_on='2026-12-01', ends_on='2026-12-01', inventory_ids=[ITEM_ID])
    cents = calculate_quote(one_day, [ITEM], [{**RATE, 'daily_price_1_day': '0.10'}], hotel)
    assert cents.total == Decimal('0.09')
    assert cents.subtotal == cents.discount_amount + cents.total


def test_zero_is_free_and_missing_is_not_a_zero_price():
    data = RentalQuoteRequest(starts_on='2026-12-01', ends_on='2026-12-01', inventory_ids=[ITEM_ID])
    free = calculate_quote(data, [ITEM], [{**RATE, 'daily_price_1_day': 0}], None)
    assert free.total == 0
    assert free.missing_rate_codes == []
    for rates in [[], [{**RATE, 'daily_price_1_day': None}]]:
        result = calculate_quote(data, [ITEM], rates, None)
        assert result.total is None
        assert result.subtotal is None
        assert result.missing_rate_codes == ['+001']


def test_invalid_period_and_duplicate_items_are_rejected():
    with pytest.raises(ValueError):
        RentalQuoteRequest(starts_on='2026-12-02', ends_on='2026-12-01', inventory_ids=[ITEM_ID])
    with pytest.raises(ValueError):
        RentalQuoteRequest(starts_on='2026-12-01', ends_on='2026-12-02', inventory_ids=[ITEM_ID, ITEM_ID])


@pytest.mark.parametrize('end,hotel_discount,promotions,expected,promotion_name',[
    ('2026-12-01',0,[(None,[2],10,'Martedì'),('2026-12-01',[],25,'Giornata')],'15.00','Giornata'),
    ('2026-12-01',30,[('2026-12-01',[],25,'Giornata')],'14.00',None),
    ('2026-12-01',15,[('2026-12-01',[],15,'Pari')],'17.00',None),
    ('2026-12-01',0,[('2026-12-02',[],90,'Domani'),(None,[4],80,'Giovedì')],'20.00',None),
    ('2026-12-03',15,[('2026-12-01',[],90,'Solo un giorno'),(None,[2],80,'Martedì')],'40.80',None),
    ('2026-12-01',0,[('2026-12-01',[],100,'Gratis')],'0.00','Gratis'),
])
def test_quote_uses_only_best_discount_and_promotions_only_for_one_day(end,hotel_discount,promotions,expected,promotion_name):
    data=RentalQuoteRequest(starts_on='2026-12-01',ends_on=end,inventory_ids=[ITEM_ID])
    hotel={'id':GROUP_ID,'name':'Albergo','discount':hotel_discount}
    promos=[{'id':str(UUID(int=i+1)),'name':name,'promotion_date':day,'weekdays':weekdays,'discount_percent':percentage,'is_active':True}
            for i,(day,weekdays,percentage,name) in enumerate(promotions)]
    result=calculate_quote(data,[ITEM],[RATE],hotel,promos)
    assert result.total == Decimal(expected)
    assert (result.promotion.name if result.promotion else None) == promotion_name
    assert result.subtotal == result.total+result.discount_amount


def test_quote_ignores_removed_promotions_and_resolves_ties_consistently():
    data=RentalQuoteRequest(starts_on='2026-12-01',ends_on='2026-12-01',inventory_ids=[ITEM_ID])
    base={'id':ITEM_ID,'name':'Prima','promotion_date':None,'weekdays':[2],'discount_percent':25,'is_active':True}
    second={**base,'id':GROUP_ID,'name':'Seconda'}
    inactive={**base,'id':'30000000-0000-0000-0000-000000000001','is_active':False,'discount_percent':100}
    result=calculate_quote(data,[ITEM],[RATE],None,[inactive,second,base])
    assert result.total == Decimal('15.00')
    assert str(result.promotion.id) == ITEM_ID


@pytest.mark.parametrize('day,expected',[
    ('2026-11-30','20.00'),('2026-12-01','15.00'),('2026-12-15','15.00'),('2026-12-31','15.00'),('2027-01-01','20.00'),
])
def test_period_promotion_has_inclusive_boundaries(day,expected):
    data=RentalQuoteRequest(starts_on=day,ends_on=day,inventory_ids=[ITEM_ID])
    promo={'id':ITEM_ID,'name':'Dicembre','promotion_date':None,'weekdays':[],
           'starts_on':'2026-12-01','ends_on':'2026-12-31','discount_percent':25,'is_active':True}
    assert calculate_quote(data,[ITEM],[RATE],None,[promo]).total == Decimal(expected)


def test_period_promotions_do_not_apply_to_multi_day_rentals_or_accumulate():
    promo={'id':ITEM_ID,'name':'Dicembre','promotion_date':None,'weekdays':[],
           'starts_on':'2026-12-01','ends_on':'2026-12-31','discount_percent':25,'is_active':True}
    weekly={**promo,'id':GROUP_ID,'name':'Martedì','starts_on':None,'ends_on':None,'weekdays':[2],'discount_percent':30}
    day=RentalQuoteRequest(starts_on='2026-12-01',ends_on='2026-12-01',inventory_ids=[ITEM_ID])
    assert calculate_quote(day,[ITEM],[RATE],None,[promo,weekly]).total == Decimal('14.00')
    multi=RentalQuoteRequest(starts_on='2026-12-01',ends_on='2026-12-03',inventory_ids=[ITEM_ID])
    hotel={'id':GROUP_ID,'name':'Albergo','discount':15}
    assert calculate_quote(multi,[ITEM],[RATE],hotel,[promo,weekly]).total == Decimal('40.80')


@pytest.mark.parametrize('with_skis', [False, True])
def test_generic_poles_are_free_with_skis_and_use_their_rate_alone(with_skis):
    pole_id='30000000-0000-0000-0000-000000000001'
    pole_group='40000000-0000-0000-0000-000000000001'
    poles={'id':pole_id,'code':'1','is_generic':True,'group':{'id':pole_group,'name':'Bastoncini generici'},
           'variant':{'brand':'Generico','model':'Bastoncini','category':{'code':'poles'}}}
    selected=[ITEM,poles] if with_skis else [poles]
    data=RentalQuoteRequest(starts_on='2026-12-01',ends_on='2026-12-03',inventory_ids=[item['id'] for item in selected])
    rates=[RATE] if with_skis else [{'group_id':pole_group,'daily_price_3_days':3}]
    result=calculate_quote(data,selected,rates,None)
    line=next(line for line in result.items if line.code=='1')
    assert line.amount==Decimal('0' if with_skis else '9')
    assert result.total==Decimal('48' if with_skis else '9')
    assert line.pack_main_id==(UUID(ITEM_ID) if with_skis else None)
    assert result.missing_rate_codes==[]


@pytest.mark.parametrize('count', [1,2,3])
def test_daily_quote_expands_each_generic_pole_pair_with_individual_prices(count):
    pole_id='30000000-0000-0000-0000-000000000001'
    poles={'id':pole_id,'code':'1','is_generic':True,'group':{'id':pole_id,'name':'Bastoncini generici'},
           'variant':{'brand':'Generico','model':'Bastoncini','category':{'code':'poles'}}}
    data=RentalQuoteRequest(starts_on='2026-12-01',ends_on='2026-12-01',inventory_ids=[ITEM_ID,pole_id],pole_quantity=count)
    result=calculate_quote(data,[ITEM,poles],[RATE,{'group_id':pole_id,'daily_price_1_day':5}],None)
    assert result.total==20+5*(count-1)
    assert len({line.line_key for line in result.items})==count+1
    lines=[line for line in result.items if line.code=='1']
    assert [line.amount for line in lines]==[0]+[5]*(count-1)


@pytest.mark.parametrize('category,boots_category', [('ski','ski_boots'),('snowboard','snowboard_boots')])
@pytest.mark.parametrize('end,pack_column,price,days', [
    ('2026-12-01','pack_price_1_day',30,1),('2026-12-02','pack_price_2_days',28,2),
    ('2026-12-03','pack_price_3_days',25,3),('2026-12-07','pack_price_7_plus_days',15,7),
    ('2026-12-08','pack_price_7_plus_days',15,8),
])
def test_daily_pack_uses_group_tier_and_includes_compatible_boots(category,boots_category,end,pack_column,price,days):
    boot_id='30000000-0000-0000-0000-000000000002'
    main={**ITEM,'variant':{**ITEM['variant'],'category':{'code':category}}}
    boot={**ITEM,'id':boot_id,'code':'BOOT','group':{'id':boot_id,'name':'Scarponi'},
          'variant':{**ITEM['variant'],'category':{'code':boots_category}}}
    data=RentalQuoteRequest(starts_on='2026-12-01',ends_on=end,inventory_ids=[ITEM_ID,boot_id])
    result=calculate_quote(data,[main,boot],[{**RATE,pack_column:price}],None)
    assert result.total==price*days and result.missing_rate_codes==[]
    assert result.items[0].price_mode=='pack' and result.items[0].daily_price==price
    assert result.items[1].price_mode=='included' and result.items[1].amount==0
    assert result.items[1].pack_main_id==UUID(ITEM_ID)


def test_daily_pack_matches_each_boot_once_and_missing_pack_price_blocks_total():
    boot_id='30000000-0000-0000-0000-000000000002'
    second_id='10000000-0000-0000-0000-000000000002'
    boot={**ITEM,'id':boot_id,'code':'BOOT','variant':{**ITEM['variant'],'category':{'code':'ski_boots'}}}
    second={**ITEM,'id':second_id,'code':'SCI2'}
    data=RentalQuoteRequest(starts_on='2026-12-01',ends_on='2026-12-01',inventory_ids=[ITEM_ID,second_id,boot_id])
    result=calculate_quote(data,[ITEM,second,boot],[{**RATE,'pack_price_1_day':30}],None)
    assert result.total==50
    assert [line.price_mode for line in result.items]==['pack','single','included']
    missing=calculate_quote(data,[ITEM,second,boot],[RATE],None)
    assert missing.total is None and missing.missing_rate_codes==['+001']
    free=calculate_quote(data,[ITEM,second,boot],[{**RATE,'pack_price_1_day':0}],None)
    assert free.total==20
    wrong={**boot,'variant':{**boot['variant'],'category':{'code':'snowboard_boots'}}}
    result=calculate_quote(data,[ITEM,second,wrong],[{**RATE,'pack_price_1_day':30}],None)
    assert result.total==60 and all(line.price_mode=='single' for line in result.items)
