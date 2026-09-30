/* =====================================================================
   core.js —— 乐理运算 / 音位表 / 调性与移调
   ⚠️ 本文件由 frontend/tools/extract_kernel.js 自动生成，请勿手工修改。
      唯一真源：kalimba-tab/index.html 的 <script id="s-*"> 块。
      重新生成：npm run kernel:extract
   段内代码逐字搬运；与原文件的差异只有下方 import 与文件尾的 export，
   以及 extract_kernel.js 中登记在案的补丁（P1/P2）。
   ===================================================================== */

/* ─────────────── 以下为段内原文（逐字搬运） ─────────────── */

/* =====================================================================
   1. 核心：音高运算 + 卡林巴音位表
   ===================================================================== */
const PC_OF   = {C:0, D:2, E:4, F:5, G:7, A:9, B:11};
const PC_NAME = ['C','C#','D','D#','E','F','F#','G','G#','A','A#','B'];
const MAJOR_STEPS = [0,2,4,5,7,9,11];          // 大调音阶各音级半音数

/* 音名 -> {step, alter, octave, midi}   例：'D6' 'F#5' 'Bb3' */
function parseNote(str){
  const m = /^([A-Ga-g])([#b]?)(-?\d)$/.exec(String(str).trim());
  if(!m) return null;
  const step = m[1].toUpperCase();
  const alter = m[2] === '#' ? 1 : (m[2] === 'b' ? -1 : 0);
  const octave = parseInt(m[3], 10);
  return {step, alter, octave, midi: 12*(octave+1) + PC_OF[step] + alter};
}
function nameOf(midi){
  const pc = ((midi % 12) + 12) % 12;
  return PC_NAME[pc] + (Math.floor(midi/12) - 1);
}
/* 音名简写（去八度），用于轨道标签第一行 */
const stepName = midi => PC_NAME[((midi%12)+12)%12];

/* 标准音位表：从左到右。17 键中心 C4；21 键中心 F3（在 17 键基础上正中插入 4 个低音） */
const TUNINGS = {
  k17: { label:'17 键（C 调）', notes:'D6 B5 G5 E5 C5 A4 F4 D4 C4 E4 G4 B4 D5 F5 A5 C6 E6' },
  k21: { label:'21 键（C 调）', notes:'D6 B5 G5 E5 C5 A4 F4 D4 B3 G3 F3 A3 C4 E4 G4 B4 D5 F5 A5 C6 E6' }
};

/* 调号：主音音名 -> 音级 */
const KEYS = [
  ['C','C 大调 / a 小调'], ['G','G 大调'], ['D','D 大调'], ['A','A 大调'],
  ['E','E 大调'], ['B','B 大调'], ['F','F 大调'], ['Bb','bB 大调'],
  ['Eb','bE 大调'], ['Ab','bA 大调'], ['Db','bD 大调'], ['F#','#F 大调']
];
const KEY_PC = {C:0,G:7,D:2,A:9,E:4,B:11,F:5,Bb:10,Eb:3,Ab:8,Db:1,'F#':6};

/* 把音位字符串编译成可用的表 */
function buildTuning(notesStr){
  const raw = String(notesStr).trim().split(/[\s,，]+/).filter(Boolean);
  const notes = raw.map(parseNote).filter(Boolean);
  const map = {};                       // midi -> 轨道号（0 起）
  notes.forEach((n, i) => { if(map[n.midi] === undefined) map[n.midi] = i; });
  const center = Math.floor(notes.length / 2);
  return {
    notes, map,
    len: notes.length,
    center,
    centerMidi: notes[center] ? notes[center].midi : null,
    minMidi: notes.length ? Math.min(...notes.map(n=>n.midi)) : 0,
    maxMidi: notes.length ? Math.max(...notes.map(n=>n.midi)) : 0,
    text: notes.map(n => n.step + (n.alter>0?'#':n.alter<0?'b':'') + n.octave).join(' ')
  };
}

/* 音级 -> 绝对音高
   mode = 'movable' 首调：1 永远落在 C4（中心键），调号只作参考
   mode = 'fixed'   固定调：1 = 调号主音所在八度（如 1=G -> G4）   */
function degreeToMidi(degree, octShift, alter, mode, keyPc){
  const rootOctave4 = mode === 'fixed' ? keyPc : 0;          // 固定调时主音落在第 4 八度
  const tonicMidi = 12 * 5 + ((rootOctave4 % 12) + 12) % 12; // 第 4 八度主音
  return tonicMidi + MAJOR_STEPS[degree-1] + 12*octShift + alter;
}

/* 找最近的可用轨道（音域外时兜底，用于标红提示） */
function nearestColumn(tuning, midi){
  let best = 0, bestD = 1e9;
  tuning.notes.forEach((n,i)=>{
    const d = Math.abs(n.midi - midi);
    if(d < bestD){ bestD = d; best = i; }
  });
  return {col: best, dist: bestD};
}

/* 在一组移调量里挑“音域内音符最多”的那个 */
function bestTranspose(midis, tuning, range){
  let best = 0, bestScore = -1;
  for(let s=-range; s<=range; s++){
    let ok = 0;
    for(const m of midis){
      if(tuning.map[m+s] !== undefined) ok++;
      else if(m+s < tuning.minMidi || m+s > tuning.maxMidi) ok -= 2;  // 出音域重罚
    }
    if(ok > bestScore){ bestScore = ok; best = s; }
  }
  return best;
}

/* ─────────────── 本模块对外出口 ─────────────── */
export { KEYS, KEY_PC, MAJOR_STEPS, PC_NAME, PC_OF, TUNINGS, bestTranspose, buildTuning, degreeToMidi, nameOf, nearestColumn, parseNote, stepName };
