/**
 * 通义千问客户端（DashScope OpenAI 兼容模式）
 * ------------------------------------------------------------
 * 仅用于人格解读这类"锦上添花"的文本生成。
 * 设计原则：任何失败都不得影响主流程 —— 调用方在拿到 null 时降级为模板文案，
 * 并把 aiCommentSource 标为 template，显式暴露是否降级（设计文档 5.6.3）。
 *
 * 费用说明（供答辩与预算参考）：
 *   - 按 token 计费，qwen-plus 约 0.0008 元/千 token（输入）级别；
 *   - 单次人格解读约 300~500 token，成本不足 0.001 元；
 *   - 未配置 DASHSCOPE_API_KEY 时直接走模板，完全零成本。
 */
import config from '../../config/index.js';
import { logger } from '../../shared/logger.js';

const SYSTEM_PROMPT =
  '你是一位既懂音乐又懂心理的乐评人。请用亲切、具体、不堆术语的中文，' +
  '为用户的音乐人格写一段 120 字以内的个性化解读，落到"听歌习惯"上，不要说空话套话。';

/* ── 熔断器（2026-10-14 第三十九批 · 开放给公众前必须补）─────────────────
   为什么要它：厂商侧故障（限流 / 超时 / 5xx）时，如果每个请求都照发，
   ① 用户那边每次都要干等 15 秒超时；② 失败请求同样在消耗配额与连接。
   连续失败达到阈值就"断开"一段时间，期间直接走模板，冷却结束再放行一次试探。
   状态存在进程内存里：单机部署（PM2 单实例）够用；若将来多实例，
   各实例各自熔断、互不影响，最坏情况是"有的实例还在试探"，不会更坏。 */
const breaker = { fails: 0, openedAt: 0, warned: false };

function breakerOpen() {
  if (breaker.fails < config.qwen.circuitThreshold) return false;
  // 冷却已过 → 归零，放行一次试探
  if (Date.now() - breaker.openedAt >= config.qwen.circuitCooldownMs) {
    breaker.fails = 0;
    breaker.warned = false;
    return false;
  }
  return true;
}
function recordFailure() {
  breaker.fails += 1;
  breaker.openedAt = Date.now();
  breaker.warned = false;
}
function recordSuccess() {
  breaker.fails = 0;
  breaker.openedAt = 0;
  breaker.warned = false;
}
/** 供自检读取当前熔断状态 */
export function breakerState() {
  return { ...breaker, open: breakerOpen() };
}

/**
 * @returns {Promise<string|null>} 成功返回解读文本；未配置密钥、熔断中、调用失败均返回 null
 */
export async function generateComment({ typeName, description, scores, nickname }) {
  if (!config.qwen.apiKey) return null;

  if (breakerOpen()) {
    // 只在状态变化时打日志，避免熔断期间每个请求都刷一行
    if (!breaker.warned) {
      logger.warn('通义千问连续失败，已熔断，期间解读走模板文案', {
        fails: breaker.fails,
        cooldownMs: config.qwen.circuitCooldownMs,
      });
      breaker.warned = true;
    }
    return null;
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15000);
  try {
    const res = await fetch(`${config.qwen.baseUrl}/chat/completions`, {
      method: 'POST',
      signal: controller.signal,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${config.qwen.apiKey}`,
      },
      body: JSON.stringify({
        model: config.qwen.model,
        temperature: 0.8,
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          {
            role: 'user',
            content:
              `昵称：${nickname || '这位听众'}\n` +
              `人格类型：${typeName}\n` +
              `类型描述：${description}\n` +
              `各维度得分：${JSON.stringify(scores)}\n` +
              '请写一段个性化解读。',
          },
        ],
      }),
    });

    if (!res.ok) {
      logger.warn('通义千问返回异常，将降级为模板文案', { status: res.status });
      recordFailure();
      return null;
    }
    const json = await res.json();
    const text = json?.choices?.[0]?.message?.content?.trim();
    if (!text) {
      logger.warn('通义千问返回空内容，将降级为模板文案');
      recordFailure();
      return null;
    }
    recordSuccess();
    return text;
  } catch (err) {
    logger.warn('通义千问调用失败，将降级为模板文案', { error: err.message });
    recordFailure();
    return null;
  } finally {
    clearTimeout(timer);
  }
}

export default { generateComment, breakerState };
