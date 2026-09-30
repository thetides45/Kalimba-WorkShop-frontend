/**
 * 乐谱 JSON 读写（规划书 3.5「乐谱数据交换格式」）。
 *
 * 设计原则（对齐规划书）：
 *  - format + version：格式标识与版本，向前兼容、未知字段忽略；
 *  - meta：曲名、作者、调号、BPM、琴型、调弦表；
 *  - source：简谱文本原文（保证可重新解析、可继续编辑）；
 *  - render：读谱方式、移调、显示选项；
 *  - 不存谱面坐标（坐标由渲染端重算）、体积小、纯文本可比对。
 *
 * serialize 只负责「包一层」，不参与内核的简谱生成 —— 内核的 gridToJianpu
 * 已经在 kalimba-tab 里经过无损往返验证，这里不重复实现、也不碰它的逻辑。
 */

const FORMAT = 'kalimba-score';
const VERSION = '1.0';

/** 把一份「制谱成果」序列化为 JSON 字符串。 */
export function serializeScore(score) {
  return JSON.stringify({
    format: FORMAT,
    version: VERSION,
    meta: score.meta || {},
    source: score.source || '',
    render: score.render || {},
  }, null, 2);
}

/** 反序列化；未知字段忽略，format 不匹配时抛错（向前兼容由 version 承担）。 */
export function parseScore(text) {
  let data;
  try {
    data = JSON.parse(text);
  } catch (e) {
    throw new Error('乐谱文件不是合法的 JSON');
  }
  if (data && data.format && data.format !== FORMAT) {
    throw new Error('不是卡林巴乐谱文件（format=' + data.format + '）');
  }
  return {
    meta: data.meta || {},
    source: typeof data.source === 'string' ? data.source : '',
    render: data.render || {},
    version: data.version || VERSION,
  };
}

export { FORMAT, VERSION };
