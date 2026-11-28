export type FilterItem = { category?: string; title?: string; type: string };
export type TrSettings = { showOnlyTurkishCategories?: boolean; hideAdultCategories?: boolean; trLive?: boolean; trMovie?: boolean; trSeries?: boolean; trUnknown?: boolean; trOverrides?: Record<string, 'show'|'hide'> };
export const normalizeCategory = (s = '') => s.normalize('NFKC').toLocaleLowerCase('tr-TR').replace(/ı/g,'i').normalize('NFD').replace(/\p{M}/gu,'').trim();
export const isAdultCategory = (name = '') => /(?:^|[^\p{L}\p{N}])(?:xxx+|adults?|18\s*\+|\+\s*18|erotik|erotic|porn(?:o|ography)?|yetiskin|sex|seks)(?=$|[^\p{L}\p{N}])/iu.test(normalizeCategory(name));
const codes = new Set('AD AE AF AG AI AL AM AO AQ AR AS AT AU AW AX AZ BA BB BD BE BF BG BH BI BJ BL BM BN BO BQ BR BS BT BV BW BY BZ CA CC CD CF CG CH CI CK CL CM CN CO CR CU CV CW CX CY CZ DE DJ DK DM DO DZ EC EE EG EH ER ES ET FI FJ FK FM FO FR GA GB GD GE GF GG GH GI GL GM GN GP GQ GR GS GT GU GW GY HK HM HN HR HT HU ID IE IL IM IN IO IQ IR IS IT JE JM JO JP KE KG KH KI KM KN KP KR KW KY KZ LA LB LC LI LK LR LS LT LU LV LY MA MC MD ME MF MG MH MK ML MM MN MO MP MQ MR MS MT MU MV MW MX MY MZ NA NC NE NF NG NI NL NO NP NR NU NZ OM PA PE PF PG PH PK PL PM PN PR PS PT PW PY QA RE RO RS RU RW SA SB SC SD SE SG SH SI SJ SK SL SM SN SO SR SS ST SV SX SY SZ TC TD TF TG TH TJ TK TL TM TN TO TR TT TV TW TZ UA UG UM US UY UZ VA VC VE VG VI VN VU WF WS YE YT ZA ZM ZW UK UAE USA GER ENG'.toLowerCase().split(' '));
const trPrefix = /^(?:[\s\[({|:–—_-]*)(?:tr|tur|turkiye|turkey|turkish|turkce|turk)(?=$|[^a-z0-9])|^\s*🇹🇷/u;
const liveCategory = /^(?:ulusal|cocuk|belgesel|haber|yerel|muzik|spor|sinema|tabii|tivibu|digiturk|d[ -]?smart|spor smart|yerli|turk)(?=$|[^a-z0-9])/;
const localChannel = /^(?:trt(?:\s*\d+|\s+(?:cocuk|haber|spor|belgesel|muzik|turk|kurdi|avaz))|kanal\s*d|atv|show\s*tv|tv\s*8|a\s*haber|a\s*spor|star\s*tv|teve2|beyaz\s*tv|haberturk|ntv|cnn\s*turk|now\s*(?:tv|turkiye)|tv100|halk\s*tv|tele\s*1)(?=$|[^a-z0-9])/;
const vodCategory = /^(?:yerli|turkce|turk|turkish|turkiye)(?=$|[^a-z0-9])/;
const countryNames = new Set<string>();
try {
  for (const locale of ['en','tr']) {
    const display = new Intl.DisplayNames([locale], {type:'region',fallback:'none'});
    for(const code of codes) { if(code.length!==2||code==='tr'||code==='uk')continue; const label=display.of(code.toUpperCase()); if(label)countryNames.add(normalizeCategory(label)); }
  }
} catch {}
for(const n of ['united kingdom','usa','germany','venezuela','india','turkmenistan','taiwan','ukraine','france','russia','arabic','english','german','french','alman','ingilizce'])countryNames.add(n);
const countryNameList = [...countryNames].sort((a,b)=>b.length-a.length);
export function classifyTr(item: FilterItem): 'tr'|'foreign'|'unknown' {
  const category=normalizeCategory(item.category), title=normalizeCategory(item.title);
  if(trPrefix.test(category))return 'tr';
  if(item.type==='live'&&liveCategory.test(category))return 'tr';
  const code=category.match(/^\s*(?:[\[({]\s*)?([a-z]{2,3})(?=$|[\s\])}:|_–—-])/);
  if(code && codes.has(code[1]) && (code[1]!=='tv' || /^\s*tv\s*[-:|]/.test(category)))return 'foreign';
  if(countryNameList.some(n=>category===n||category.startsWith(n+' ')||category.startsWith(n+'-')||category.startsWith(n+':')))return 'foreign';
  if(item.type==='live'){
    if(liveCategory.test(category)||trPrefix.test(title)||localChannel.test(title))return 'tr';
  }else if(vodCategory.test(category))return 'tr';
  return 'unknown';
}
export const categoryKey=(type:string,category='')=>type+':'+normalizeCategory(category||'Genel');
export function createContentFilter(settings:TrSettings) {
  const cache=new Map<string,ReturnType<typeof classifyTr>>();
  return (item:FilterItem):boolean=>{
    if(settings.hideAdultCategories&&(isAdultCategory(item.category)||isAdultCategory(item.title)))return false;
    const key=categoryKey(item.type,item.category);
    const override=settings.trOverrides?.[key];
    if(!settings.showOnlyTurkishCategories)return true;
    if(item.type==='live'&&settings.trLive===false||item.type==='movie'&&settings.trMovie===false||item.type==='series'&&settings.trSeries===false)return true;
    if(override)return override==='show';
    let status=cache.get(key);
    if(!status){status=classifyTr({...item,title:''});cache.set(key,status);}
    if(status==='unknown'&&item.type==='live')status=classifyTr(item);
    return status==='tr'||status==='unknown'&&settings.trUnknown===true;
  };
}
