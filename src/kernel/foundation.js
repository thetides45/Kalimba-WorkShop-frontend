/* =====================================================================
   foundation.js —— 内核常量表（原散落在 s-ui 各处的表与常量）
   ⚠️ 本文件由 frontend/tools/extract_kernel.js 自动生成，请勿手工修改。
      唯一真源：kalimba-tab/index.html 的 <script id="s-*"> 块。
      重新生成：npm run kernel:extract
   段内代码逐字搬运；与原文件的差异只有下方 import 与文件尾的 export，
   以及 extract_kernel.js 中登记在案的补丁（P1/P2）。
   ===================================================================== */

/* ─────────────── 以下为段内原文（逐字搬运） ─────────────── */

const $ = id => document.getElementById(id);

const PC_KEYNAME = {0:'C',7:'G',2:'D',9:'A',4:'E',11:'B',5:'F',10:'Bb',3:'Eb',8:'Ab',1:'Db',6:'F#'};

const XML_HEAD = '<?xml version="1.0" encoding="UTF-8"?>\n';

const FILE_BAD = /[\\/:*?"<>|]+/g;

const BPM_MIN = 20, BPM_MAX = 300;

const XML_UNTITLED = '未命名';

const FIFTHS_KEY = {0:'C',1:'G',2:'D',3:'A',4:'E',5:'B',6:'F#',7:'Db',
  '-1':'F','-2':'Bb','-3':'Eb','-4':'Ab','-5':'Cb','-6':'F#','-7':'Cb'};

const BEAT_UNIT_Q = {maxima:32, long:16, breve:8, whole:4, half:2, quarter:1,
  eighth:0.5, '16th':0.25, '32nd':0.125, '64th':0.0625};

/* General MIDI 128 音色名：直接拿来当「通道名」显示 */
const GM_INSTR = ['Acoustic Grand Piano','Bright Acoustic Piano','Electric Grand Piano','Honky-tonk Piano',
'电钢琴 1 (Electric Piano 1)','电钢琴 2 (Electric Piano 2)','大键琴 (Harpsichord)','击弦古钢琴 (Clavinet)',
'钢片琴 (Celesta)','钟琴 (Glockenspiel)','八音盒 (Music Box)','颤音琴 (Vibraphone)','马林巴 (Marimba)',
'木琴 (Xylophone)','管钟 (Tubular Bells)','扬琴 (Dulcimer)','拉杆风琴 (Drawbar Organ)','敲击风琴 (Percussive Organ)',
'摇滚风琴 (Rock Organ)','教堂管风琴 (Church Organ)','簧风琴 (Reed Organ)','手风琴 (Accordion)','口琴 (Harmonica)',
'探戈手风琴 (Tango Accordion)','尼龙弦吉他','钢弦吉他','爵士电吉他','清音电吉他','闷音电吉他','过载电吉他',
'失真电吉他','吉他泛音','原声贝斯','指弹电贝斯','拨片电贝斯','无品贝斯','击弦贝斯 1','击弦贝斯 2',
'合成贝斯 1','合成贝斯 2','小提琴 (Violin)','中提琴 (Viola)','大提琴 (Cello)','低音提琴 (Contrabass)',
'震音弦乐 (Tremolo Strings)','拨弦弦乐 (Pizzicato Strings)','竖琴 (Orchestral Harp)','定音鼓 (Timpani)',
'弦乐合奏 1','弦乐合奏 2','合成弦乐 1','合成弦乐 2','人声「啊」(Choir Aahs)','人声「哦」(Voice Oohs)',
'合成人声 (Synth Voice)','管弦乐齐奏 (Orchestra Hit)','小号 (Trumpet)','长号 (Trombone)','大号 (Tuba)',
'弱音小号 (Muted Trumpet)','圆号 (French Horn)','铜管组 (Brass Section)','合成铜管 1','合成铜管 2',
'高音萨克斯 (Soprano Sax)','中音萨克斯 (Alto Sax)','次中音萨克斯 (Tenor Sax)','上低音萨克斯 (Baritone Sax)',
'双簧管 (Oboe)','英国管 (English Horn)','巴松 (Bassoon)','单簧管 (Clarinet)','短笛 (Piccolo)','长笛 (Flute)',
'竖笛 (Recorder)','排箫 (Pan Flute)','吹瓶 (Blown Bottle)','尺八 (Shakuhachi)','口哨 (Whistle)','陶笛 (Ocarina)',
'合成主音 1（方波）','合成主音 2（锯齿）','合成主音 3（汽笛）','合成主音 4（芯片）','合成主音 5（沙铃）',
'合成主音 6（人声）','合成主音 7（五度）','合成主音 8（贝斯+主音）','合成铺垫 1（新世纪）','合成铺垫 2（温暖）',
'合成铺垫 3（复合成）','合成铺垫 4（合唱）','合成铺垫 5（弓弦）','合成铺垫 6（金属）','合成铺垫 7（光环）',
'合成铺垫 8（清扫）','效果 1（雨）','效果 2（音轨）','效果 3（水晶）','效果 4（氛围）','效果 5（明亮）',
'效果 6（哥布林）','效果 7（回声）','效果 8（科幻）','西塔琴 (Sitar)','班卓琴 (Banjo)','三味线 (Shamisen)',
'筝 (Koto)','卡林巴 (Kalimba)','风笛 (Bagpipe)','民族小提琴 (Fiddle)','唢呐 (Shanai)','铃铛 (Tinkle Bell)',
'阿戈戈 (Agogo)','钢鼓 (Steel Drums)','木鱼 (Woodblock)','太鼓 (Taiko Drum)','旋律嗵鼓 (Melodic Tom)',
'合成鼓 (Synth Drum)','反镲 (Reverse Cymbal)','吉他品丝噪声','呼吸声','海浪声','鸟鸣','电话铃','直升机','掌声','枪声'];

const GM_DRUM_CH = 9;                     // MIDI 通道 10（0 起索引 9）= 打击乐轨

/* 用 Krumhansl 大调轮廓做一次简单调性检测：MIDI 没有调号，得自己猜一个，否则简谱会满是升降号 */
const KEY_PROFILE = [6.35,2.23,3.48,2.33,4.38,4.09,2.52,5.19,2.39,3.66,2.29,2.88];

const META_ALIAS = {tuning:'琴型', mode:'读谱方式', direction:'读谱方向', transpose:'移谱|移调'};

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for(let n = 0; n < 256; n++){
    let c = n;
    for(let k = 0; k < 8; k++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
    t[n] = c >>> 0;
  }
  return t;
})();

const PNG_SCALE = 2;

/* ─────────────── 本模块对外出口 ─────────────── */
export { $, BEAT_UNIT_Q, BPM_MAX, BPM_MIN, CRC_TABLE, FIFTHS_KEY, FILE_BAD, GM_DRUM_CH, GM_INSTR, KEY_PROFILE, META_ALIAS, PC_KEYNAME, PNG_SCALE, XML_HEAD, XML_UNTITLED };
