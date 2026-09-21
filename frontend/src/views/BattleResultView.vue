<template>
  <div class="result">
    <div v-if="loading" class="state muted">正在加载结果…</div>

    <template v-else-if="data">
      <!-- 对位赛 / 指定对决：没有冠军，给逐行对照战报
           ⚠️ 2026-09-20 用户点名重做："对位赛的结算图也要参考混战模式，要有专辑图片、要有设计美感，
           而且导出的战报…整个功能全部参考混战模式重做"。改法：每行不再是一行纯文字，
           而是与混战战报同款的「两张专辑（封面 + 名称 + 票数），胜方高亮」结构。 -->
      <template v-if="data.type === 'aligned'">
        <div class="reportwrap">
          <!-- 分享按钮放在被导出元素**外面**（只视觉上叠在卡片右上角），这样不会被截进战报图里
               —— 用户："对位赛的分享功能不应该放到最下面"。 -->
          <!-- ⚠️ 2026-09-21 用户报：「对位赛里点这个按钮跳到『冠军还没决出』」。
               根因是它以前指向 /battle/:id/share —— 而那个页面只做「夺冠之路（冠军）」，
               对位赛本来就不产生冠军，于是必然落进空态，看着像坏了。
               → 对位赛的分享出口就是**本页的战报图**，这里改成直接触发生成（不再跳页）。 -->
          <button class="sharefloat" type="button" :disabled="exporting" @click="exportShare">
            <svg class="ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
              <circle cx="18" cy="5" r="3" /><circle cx="6" cy="12" r="3" /><circle cx="18" cy="19" r="3" />
              <path d="M8.6 13.5l6.8 4M15.4 6.5l-6.8 4" />
            </svg>
            {{ exporting === 'share' ? '正在生成…' : '分享 好友一起玩' }}
          </button>

        <div ref="reportEl" class="aligned-report">
          <div class="arep-top">
            <span class="stop">音格 · YINGE.APP</span>
            <span class="pillx">对位赛 · 战报</span>
          </div>

          <!-- 大比分：谁比谁一眼看清（用户："比如 11 比 8 谁比谁，字体要清楚够大"） -->
          <div class="arep-score">
            <span class="asn">{{ alignedSideNames[0] }}</span>
            <b class="asv num">{{ alignedScore[0] }}</b>
            <i class="ascol">:</i>
            <b class="asv num">{{ alignedScore[1] }}</b>
            <span class="asn">{{ alignedSideNames[1] }}</span>
          </div>

          <div class="arep-vs">
            <template v-if="alignedLeader && alignedLeader.tie">
              {{ alignedLeader.names.length > 2 ? '并列领先' : '双方打平' }} · 各胜 {{ alignedLeader.wins }} 场
            </template>
            <template v-else-if="alignedLeader">{{ alignedLeader.name }} 领先 {{ alignedLeader.wins }} 场</template>
            <template v-else>暂无胜场</template>
            <span class="sep">|</span>共 {{ (data.rows || []).length }} 场对位
          </div>

          <!-- 歌手对比积分：只在顶部展示这一次（下面不再重复） -->
          <div v-if="(data.points || []).length" class="arep-pts">
            <span v-for="(p, i) in data.points || []" :key="i" class="aptchip">
              {{ artistNameOf(p.artistExternalId) }} <b class="num">{{ p.wins }}</b> 胜
            </span>
          </div>

          <div class="hd" style="margin-top: 18px">
            <b>逐行对照表</b><span>每行一组对位 · 高亮为该行胜方</span>
          </div>

          <div class="amres" v-for="(r, i) in data.rows || []" :key="i">
            <div class="mhd">
              <span class="rd">第 {{ r.alignIndex }} 组</span>
              <span class="say">
                <template v-if="rowWinnerSide(r)">
                  <b>《{{ rowWinnerSide(r) === 'left' ? r.left?.name : r.right?.name }}》</b> 胜出
                </template>
                <template v-else>本场未投票</template>
                <em class="muted"> · {{ r.left?.artistName || '—' }} vs {{ r.right?.artistName || '—' }}</em>
              </span>
            </div>
            <div class="pside" :class="rowWinnerSide(r) === 'left' ? 'win' : 'lose'">
              <div class="art">
                <img :src="r.left?.artworkUrl" :alt="r.left?.name" loading="lazy" />
              </div>
              <div class="tx">
                <b>{{ r.left?.name || '—' }}</b>
                <span>{{ year(r.left?.releaseDate) }} · {{ r.left?.trackCount ?? '—' }} 首</span>
              </div>
              <div class="pc num" v-if="r.leftVotes">{{ r.leftVotes }}</div>
              <div class="pc zero" v-else>未得一票</div>
              <FavoriteButton v-if="r.left" :album="r.left" icon-only small />
              <span v-if="rowWinnerSide(r) === 'left'" class="bw">胜</span>
            </div>
            <div class="pside" :class="rowWinnerSide(r) === 'right' ? 'win' : 'lose'">
              <div class="art">
                <img :src="r.right?.artworkUrl" :alt="r.right?.name" loading="lazy" />
              </div>
              <div class="tx">
                <b>{{ r.right?.name || '—' }}</b>
                <span>{{ year(r.right?.releaseDate) }} · {{ r.right?.trackCount ?? '—' }} 首</span>
              </div>
              <div class="pc num" v-if="r.rightVotes">{{ r.rightVotes }}</div>
              <div class="pc zero" v-else>未得一票</div>
              <FavoriteButton v-if="r.right" :album="r.right" icon-only small />
              <span v-if="rowWinnerSide(r) === 'right'" class="bw">胜</span>
            </div>
          </div>

          <div class="arep-foot">音格 · 专辑对决　|　对位赛不产生冠军，出的是逐张对照表</div>
        </div>
        </div>

        <!-- 简洁分享图（2026-09-20 新增）：用户说详细战报保留，但要一张"更适合分享互动"的图。
             这里做成 720px 宽的紧凑卡：大比分 + 每组一行（小封面 + 比分），两列排布，截图/转发都清楚。 -->
        <div class="share-block">
          <div class="hd" style="margin: 18px 0 10px">
            <b>分享图预览</b><span>简洁版 · 适合发群里/朋友圈，点下面按钮保存</span>
          </div>
          <div ref="shareEl">
            <AlignedMiniCard
              :names="alignedSideNames"
              :score="alignedScore"
              :leader-text="miniLeaderText"
              :rows="data.rows || []"
            />
          </div>
        </div>

        <div class="btns" style="margin-top: 18px">
          <button class="btn pri" type="button" :disabled="exporting" @click="exportShare">
            <svg class="ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
              <path d="M12 16V4M8 8l4-4 4 4M5 20h14" />
            </svg>
            {{ exporting === 'share' ? '正在生成…' : '保存分享图（简洁版）' }}
          </button>
          <button class="btn ghost" type="button" :disabled="exporting" @click="exportReport">
            {{ exporting === 'full' ? '正在生成…' : '保存详细战报' }}
          </button>
          <RouterLink :to="{ name: 'battle-create' }" class="btn ghost">再玩一次</RouterLink>
        </div>
      </template>

      <!-- 冠军 -->
      <template v-else-if="champion">
        <div class="crown-wrap">
          <div class="art"><img :src="champion.artworkUrl" :alt="champion.name" /></div>
          <div class="cinfo">
            <div class="cw">CHAMPION · 冠军</div>
            <h3>{{ champion.name }}</h3>
            <p>{{ championMeta }}</p>
            <div class="btns">
              <RouterLink :to="{ name: 'battle-share', params: { id } }" class="btn pri">
                <svg class="ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
                  <path d="M12 16V4M8 8l4-4 4 4M5 20h14" />
                </svg>
                生成夺冠之路
              </RouterLink>
              <button class="btn ghost" type="button" :disabled="inviting" @click="makeInvite">
                {{ inviting ? '生成中…' : '和好友一起玩' }}
              </button>
              <RouterLink :to="{ name: 'battle-create' }" class="btn ghost">再玩一次</RouterLink>
              <FavoriteButton :album="champion" />
            </div>

            <!-- 同款签表：生成后露出邀请码与链接（好友打开即进同一批专辑） -->
            <div v-if="invite.code" class="invitebox">
              <div class="ibhd">
                <b>同款签表已生成</b>
                <span>把这串码或链接发给好友，他打开后打的是<b>完全同一批专辑</b></span>
              </div>
              <div class="ibrow">
                <code class="ibcode">{{ invite.code }}</code>
                <button class="mini" type="button" @click="copyInvite">复制链接</button>
                <RouterLink class="mini" :to="{ name: 'battle-join', params: { code: invite.code } }">
                  查看对比
                </RouterLink>
              </div>
            </div>
          </div>
        </div>

        <!-- 亚军 / 季军（守则 19）：亚军=决赛负方；季军=四强落败者中累计得票更高者 -->
        <div v-if="podium.runnerUp || podium.third" class="podium">
          <div v-if="podium.runnerUp" class="pd">
            <div class="art"><img :src="podium.runnerUp.artworkUrl" :alt="podium.runnerUp.name" /></div>
            <div class="tx">
              <span class="rk rk2">亚军</span>
              <b>{{ podium.runnerUp.name }}</b>
              <span>{{ podium.runnerUp.artistName }} · {{ year(podium.runnerUp.releaseDate) }}</span>
            </div>
            <FavoriteButton :album="podium.runnerUp" icon-only small />
          </div>
          <div v-if="podium.third" class="pd">
            <div class="art"><img :src="podium.third.artworkUrl" :alt="podium.third.name" /></div>
            <div class="tx">
              <span class="rk rk3">季军</span>
              <b>{{ podium.third.name }}</b>
              <span>{{ podium.third.artistName }} · {{ year(podium.third.releaseDate) }}</span>
            </div>
            <FavoriteButton :album="podium.third" icon-only small />
          </div>
          <p v-if="podium.note" class="note">{{ podium.note }}</p>
        </div>

        <div class="kpis">
          <div class="kpi"><b>{{ kpiRounds }}</b><span>夺冠轮次</span></div>
          <div class="kpi"><b>{{ kpiMine }}</b><span>累计得票</span></div>
          <div class="kpi"><b>{{ kpiTheirs }}</b><span>对手总票数</span></div>
        </div>

        <!-- 2026-09-19 用户定稿的折叠顺序：小组赛与复活 → 夺冠之路 → 淘汰赛 → 完整晋级图（全部可折叠） -->
        <details v-if="groupStages.length" class="fold">
          <summary class="foldhd">
            <b>小组赛与复活</b>
            <span>每张专辑从哪里出线 · 冠军走过的路会高亮（点这里展开）</span>
            <i class="chev" aria-hidden="true"></i>
          </summary>
          <div class="gstage">
            <div v-for="g in groupStages" :key="g.key" class="gsrow">
              <div class="gshd">
                <b>{{ g.label }}</b><span>选 {{ g.advanceCount }} 张晋级</span>
              </div>
              <div class="gslist">
                <div
                  v-for="al in g.albums"
                  :key="al.albumId"
                  class="gsi"
                  :class="{ adv: g.advancedIds.includes(String(al.albumId)), champ: isChampion(al) }"
                >
                  <img :src="al.artworkUrl" :alt="al.name" loading="lazy" />
                  <span>{{ al.name }}</span>
                  <i v-if="g.advancedIds.includes(String(al.albumId))">晋级</i>
                  <!-- 落选的也标出来：以前只有晋级的有角标，落选的"灰着但没说为什么" -->
                  <i v-else class="out">淘汰</i>
                </div>
              </div>
            </div>
          </div>
        </details>

        <details class="fold" open>
          <summary class="foldhd">
            <b>夺冠之路</b>
            <span>每一场：谁赢了谁，各自得了多少票</span>
            <i class="chev" aria-hidden="true"></i>
          </summary>

        <div class="path">
          <div v-if="!pathRows.length" class="note">这个赛制没有淘汰赛路径（对位赛 / 指定对决请看上面的对照表）。</div>
          <div v-for="(row, i) in pathRows" :key="i" class="mres" :class="{ final: row.isFinal }">
            <div class="mhd">
              <span class="rd">{{ row.roundLabel }}</span>
              <span class="say" v-if="row.opponent">
                <b>《{{ champion.name }}》</b> 战胜 <i>《{{ row.opponent.name }}》</i>
                <template v-if="row.isFinal">，拿下冠军</template>
              </span>
              <span class="say" v-else><b>《{{ champion.name }}》</b> 轮空直接晋级</span>
            </div>

            <div class="pside win">
              <div class="art"><img :src="champion.artworkUrl" :alt="champion.name" /></div>
              <div class="tx">
                <b>{{ champion.name }}</b>
                <span>{{ champion.artistName }} · {{ year(champion.releaseDate) }}</span>
              </div>
              <div class="pc" v-if="row.mine">{{ row.mine }} 票</div>
              <div class="pc zero" v-else>未得一票</div>
              <span class="bw">胜</span>
            </div>

            <div class="pside lose" v-if="row.opponent">
              <div class="art"><img :src="row.opponent.artworkUrl" :alt="row.opponent.name" /></div>
              <div class="tx">
                <b>{{ row.opponent.name }}</b>
                <span>{{ row.opponent.artistName }} · {{ year(row.opponent.releaseDate) }}</span>
              </div>
              <!-- ⚠️ 2026-09-21 用户指出："本来就是二选一胜利，这个对手得票数为 0 真的 ok 吗？"
                   一轮 1v1 里输方本来就（几乎）必然是 0 票 —— 把「0 票」印成和胜方「1 票」同等分量的数字，
                   会让人以为"这场没打完/没人投"。所以输方 0 票改成一句弱化的说明；只有真得了票才显示数字。 -->
              <div class="pc num" v-if="row.theirs">{{ row.theirs }} 票</div>
              <div class="pc zero" v-else>未得一票</div>
              <!-- 落败方补一枚「淘汰」标：以前只有胜方有「胜」，两边不对等 -->
              <span class="bw out">淘汰</span>
            </div>
          </div>
        </div>
        </details>

        <!-- 淘汰赛 · 全部对局（守则 39）：每一轮谁打了谁、谁被淘汰 —— 含冠军没参与的对局 -->
        <details v-if="koRounds.length" class="fold">
          <summary class="foldhd">
            <b>淘汰赛 · 全部对局</b>
            <span>按轮次列全部对局（含冠军未参与的）· 冠军的对局会描边高亮</span>
            <i class="chev" aria-hidden="true"></i>
          </summary>
          <div class="ko">
            <div v-for="r in koRounds" :key="r.roundName" class="koround">
              <div class="kohd"><b>{{ r.label }}</b><span>{{ r.matches.length }} 场</span></div>
              <div v-for="m in r.matches" :key="m.matchId" class="kom" :class="{ mine: involvesChampion(m) }">
                <div class="kside" :class="sideClassOf(m, m.leftAlbum)">
                  <div class="art"><img :src="m.leftAlbum?.artworkUrl" :alt="m.leftAlbum?.name" loading="lazy" /></div>
                  <div class="tx">
                    <b>{{ m.leftAlbum?.name || '—' }}</b>
                    <span>{{ m.leftAlbum?.artistName || '' }}</span>
                  </div>
                  <div class="vt num" :class="{ zero: !m.leftVotes }">{{ m.leftVotes || 0 }} 票</div>
                  <span class="bdg">{{ bdgOf(m, m.leftAlbum) }}</span>
                </div>
                <div class="kvs">VS</div>
                <div class="kside" :class="sideClassOf(m, m.rightAlbum)">
                  <div class="art"><img :src="m.rightAlbum?.artworkUrl" :alt="m.rightAlbum?.name" loading="lazy" /></div>
                  <div class="tx">
                    <b>{{ m.rightAlbum?.name || '—' }}</b>
                    <span>{{ m.rightAlbum?.artistName || '' }}</span>
                  </div>
                  <div class="vt num" :class="{ zero: !m.rightVotes }">{{ m.rightVotes || 0 }} 票</div>
                  <span class="bdg">{{ bdgOf(m, m.rightAlbum) }}</span>
                </div>
              </div>
            </div>
          </div>
        </details>

        <!-- 完整晋级图（紧凑版）：默认收起，点开才是"小封面 + 小字 + 横向拖动"的树，不再一屏铺满 -->
        <details v-if="koRounds.length" class="fold">
          <summary class="foldhd">
            <b>完整晋级图</b>
            <span>横向拖动看完整条淘汰赛路径 · 小封面小字</span>
            <i class="chev" aria-hidden="true"></i>
          </summary>
          <BracketTree :matches="allMatches" :champion="champion" compact />
        </details>
      </template>

      <!-- 杯赛但还没打完 -->
      <template v-else>
        <div class="state g-card">
          <h2>对决还没结束</h2>
          <p class="muted">冠军还没决出来，先把剩下的场次投完。</p>
          <div class="btns">
            <RouterLink :to="{ name: 'battle-pk', params: { id } }" class="btn pri">继续投票</RouterLink>
            <RouterLink :to="{ name: 'battle-bracket', params: { id } }" class="btn ghost">看对阵表</RouterLink>
          </div>
        </div>
      </template>
    </template>

    <div v-else class="state g-card">
      <h2>读不到这个对决</h2>
      <RouterLink to="/battle/mine" class="btn ghost">回我的对决</RouterLink>
    </div>
  </div>
</template>

<script setup>
import { computed, onMounted, ref } from 'vue';
import { useRoute } from 'vue-router';
import { ElMessage } from 'element-plus';
import { battleApi } from '@/api';
import { ROUND_CN } from '@/utils/tournament.js';
import FavoriteButton from '@/components/FavoriteButton.vue';
import BracketTree from '@/components/BracketTree.vue';
// 对位赛「简洁分享卡」抽成组件：结果页与分享页共用（否则分享页拿不到对位赛的图）
import AlignedMiniCard from '@/components/AlignedMiniCard.vue';
// 打完了 → 清掉「本地续玩」记录（否则首页会一直挂着一条"你还有一局没打完"）
import { clearResumeIf } from '@/utils/resume.js';

const route = useRoute();
const id = route.params.id;

const loading = ref(true);
const data = ref(null);
/** 对决明细（含全部场次）——用来推导亚军/季军与完整晋级图，取不到也不影响结果页 */
const detail = ref(null);

const champion = computed(() => data.value?.champion || null);
const year = (d) => (d ? String(d).slice(0, 4) : '');

/** 对位赛的积分按歌手外部标识聚合，这里换回名字 */
const artistNameOf = (id) => {
  const hit = (data.value?.battle?.artists || []).find((a) => String(a.artistId) === String(id));
  return hit?.name || `歌手 ${id}`;
};

// —— 对位赛战报（此前这页只有两张表，被用户说"寒酸"） ——
const reportEl = ref(null);
const shareEl = ref(null);
const exporting = ref(false);

// —— 和好友一起玩：同款签表 ——
const inviting = ref(false);
const invite = ref({ code: '' });

async function makeInvite() {
  if (invite.value.code) return;
  inviting.value = true;
  try {
    const d = await battleApi.invite(id);
    invite.value = { code: d?.shareCode || '' };
    if (invite.value.code) ElMessage.success('已生成同款签表，把链接发给好友吧');
  } catch (e) {
    ElMessage.error(e?.message || '生成失败');
  } finally {
    inviting.value = false;
  }
}

async function copyInvite() {
  const url = `${location.origin}/battle/join/${invite.value.code}`;
  try {
    await navigator.clipboard.writeText(url);
    ElMessage.success('链接已复制');
  } catch {
    ElMessage.info(url);
  }
}

/** 这一行的胜方在哪一侧（'left' | 'right' | null）。winnerAlbumId 与 left/right 同为外部 id，可直接比 */
function rowWinnerSide(r) {
  if (!r?.winnerAlbumId) return null;
  if (String(r.winnerAlbumId) === String(r.left?.albumId)) return 'left';
  if (String(r.winnerAlbumId) === String(r.right?.albumId)) return 'right';
  return null;
}

/** 总比分：两侧各行的票数累加 */
const alignedScore = computed(() => {
  let l = 0;
  let rr = 0;
  for (const r of data.value?.rows || []) {
    l += Number(r.leftVotes || 0);
    rr += Number(r.rightVotes || 0);
  }
  return [l, rr];
});

/** 积分榜首（平手时 points[0].wins 为 0 → 不显示"领先"） */
const alignedLeader = computed(() => {
  const ps = [...(data.value?.points || [])].sort((a, b) => b.wins - a.wins);
  if (!ps.length || !ps[0]?.wins) return null;
  const top = ps[0];
  // ⚠️ 2026-09-20 用户截图报的 bug：总比分 5:5 平局，却写"周杰伦领先 5 场"。
  //    并列第一必须是"打平/并列领先"，不能挑一个说领先。
  const tied = ps.filter((p) => p.wins === top.wins);
  if (tied.length > 1) {
    return { tie: true, wins: top.wins, names: tied.map((p) => artistNameOf(p.artistExternalId)) };
  }
  return { tie: false, name: artistNameOf(top.artistExternalId), wins: top.wins };
});

/** 对位赛双方名字（简洁分享图的大比分条用）：从第一组对位里取，通常就是这场对决的两位歌手 */
const alignedSideNames = computed(() => {
  const rows = data.value?.rows || [];
  if (rows.length) return [rows[0].left?.artistName || '左', rows[0].right?.artistName || '右'];
  const ps = data.value?.points || [];
  return [artistNameOf(ps[0]?.artistExternalId) || '左', artistNameOf(ps[1]?.artistExternalId) || '右'];
});

/** 简洁分享卡上那句「谁领先几场」（并列时说"打平"，不能写成某方领先） */
const miniLeaderText = computed(() => {
  const l = alignedLeader.value;
  if (!l) return '暂无胜场';
  if (l.tie) return l.names.length > 2 ? '并列领先' : '双方打平';
  return `${l.name} 领先 ${l.wins} 场`;
});

/** 保存战报图：html2canvas 截战报卡（对位赛此前没有任何分享出口） */
/**
 * 导出为 PNG（详细战报 / 简洁分享图共用）
 * ⚠️ 用**实心底色**导出：透明底发到微信/QQ 里会被压成黑底（详细战报那张尤其明显）。
 */
async function exportImage(el, filename, mode) {
  if (!el) return;
  exporting.value = mode;
  try {
    const { default: html2canvas } = await import('html2canvas');
    const canvas = await html2canvas(el, {
      scale: Math.max(2, 1080 / el.offsetWidth),
      backgroundColor: '#f7fbfe',
      useCORS: true,
    });
    const a = document.createElement('a');
    a.href = canvas.toDataURL('image/png');
    a.download = filename;
    a.click();
    ElMessage.success('已保存到下载文件夹');
  } catch (err) {
    ElMessage.error(err?.message || '生成失败');
  } finally {
    exporting.value = false;
  }
}

const exportReport = () => exportImage(reportEl.value, `音格对位赛战报-${id}.png`, 'full');
const exportShare = () => exportImage(shareEl.value, `音格对位赛分享图-${id}.png`, 'share');

const isChampion = (al) => !!champion.value && String(al?.albumId) === String(champion.value.albumId);

const championMeta = computed(() => {
  if (!champion.value) return '';
  const b = data.value?.battle || {};
  const parts = [champion.value.artistName, year(champion.value.releaseDate)].filter(Boolean);
  if (champion.value.trackCount) parts.push(`${champion.value.trackCount} 首`);
  const pool = b.poolTarget || 0;
  const artists = (b.artists || []).length;
  if (pool && artists) parts.push(`在 ${pool} 张专辑、${artists} 位歌手的混战中胜出`);
  else if (pool) parts.push(`在 ${pool} 张专辑的对决中胜出`);
  return parts.join(' · ');
});

/** 全部场次（排除轮空，轮空没有对手也没有比分） */
const allMatches = computed(() => (detail.value?.matches || []).filter((m) => !m.isBye));

/** 某张专辑在所有场次里拿到的累计票数 */
function albumTotalVotes(albumId) {
  let n = 0;
  for (const m of allMatches.value) {
    if (m.leftAlbum && String(m.leftAlbum.albumId) === String(albumId)) n += Number(m.leftVotes || 0);
    else if (m.rightAlbum && String(m.rightAlbum.albumId) === String(albumId)) n += Number(m.rightVotes || 0);
  }
  return n;
}

/**
 * 胜方的「外部 albumId」
 * ------------------------------------------------------------
 * 优先用后端字段 winnerAlbumExternalId；
 * 若后端还是旧版本（没这个字段），按票数兜底推断 —— 否则已投票的场次会被误显示成「待投」，
 * 季军 / 亚军也推不出来。票数相同且无字段时返回 null（确实分不出，才显示「待投」）。
 */
function winnerExternalIdOf(m) {
  if (m?.winnerAlbumExternalId != null) return String(m.winnerAlbumExternalId);
  const l = Number(m?.leftVotes || 0);
  const r = Number(m?.rightVotes || 0);
  if (l === r) return null;
  const side = l > r ? m.leftAlbum : m.rightAlbum;
  return side ? String(side.albumId) : null;
}

/** 一场里输的那一边（以及它在这一场拿到的票数） */
function loserOf(m) {
  const w = winnerExternalIdOf(m);
  if (w == null) return null;
  const leftIsWinner = m.leftAlbum && String(m.leftAlbum.albumId) === w;
  const album = leftIsWinner ? m.rightAlbum : m.leftAlbum;
  if (!album) return null;
  return { album, votes: leftIsWinner ? Number(m.rightVotes || 0) : Number(m.leftVotes || 0) };
}

/** 淘汰赛各轮（按轮次顺序，组内按 matchOrder） */
const koRounds = computed(() => {
  const byRound = new Map();
  for (const m of allMatches.value) {
    const key = m.roundName || 'other';
    if (!byRound.has(key)) byRound.set(key, []);
    byRound.get(key).push(m);
  }
  const rounds = [...byRound.entries()].map(([roundName, list]) => ({
    roundName,
    label: ROUND_CN[roundName] || roundName,
    roundIndex: Number(list[0]?.roundIndex ?? 0),
    matches: list.slice().sort((a, b) => Number(a.matchOrder ?? 0) - Number(b.matchOrder ?? 0)),
  }));
  return rounds.sort((a, b) => a.roundIndex - b.roundIndex);
});

/**
 * 领奖台（守则 19）
 * ------------------------------------------------------------
 * 亚军 = 决赛负方（唯一、无歧义）。
 * 季军 = 决赛前一轮（半决赛）两位负方中**累计得票更高**者；
 *        累计相同则比该场得票，再相同按专辑名排序（保证结果稳定可复现）。
 * ⚠️ 本赛制是单败淘汰、不设三四名决赛，所以季军是「推定」，界面必须标注清楚，不能假装打过一场。
 */
const podium = computed(() => {
  const rounds = koRounds.value;
  if (!rounds.length || !champion.value) return { runnerUp: null, third: null, note: '' };

  const finalRound = rounds[rounds.length - 1];
  const finalMatch = finalRound.matches.find((m) => winnerExternalIdOf(m) != null);
  const runnerUp = finalMatch ? loserOf(finalMatch)?.album || null : null;

  let third = null;
  let note = '';
  if (rounds.length >= 2) {
    const semi = rounds[rounds.length - 2];
    const losers = semi.matches.map(loserOf).filter(Boolean);
    if (losers.length) {
      const best = losers.slice().sort((a, b) => {
        const ta = albumTotalVotes(a.album.albumId);
        const tb = albumTotalVotes(b.album.albumId);
        if (tb !== ta) return tb - ta;
        if (b.votes !== a.votes) return b.votes - a.votes;
        return String(a.album.name).localeCompare(String(b.album.name));
      })[0];
      third = best.album;
      note =
        losers.length > 1
          ? '本赛制为单败淘汰、不设三四名决赛，季军按「四强落败者中累计得票更高者」推定'
          : '';
    }
  }
  return { runnerUp, third, note };
});

/** 小组赛 / 遗珠复活：每张专辑从哪里出线 */
const groupStages = computed(() => {
  const gs = data.value?.groupsSummary || [];
  return gs.map((g, i) => ({
    key: `${g.roundName}-${g.groupNo}-${i}`,
    label: g.roundName === 'revival' ? '遗珠复活' : `第 ${g.groupNo} 组`,
    advanceCount: g.advanceCount,
    albums: g.albums || [],
    advancedIds: (g.advanced || []).map((a) => String(a?.albumId)),
  }));
});

/** 夺冠之路行：解析后端给的比分字符串 "我方 : 对方" */
const pathRows = computed(() => {
  const list = data.value?.path || [];
  const lastRound = list.length ? list[list.length - 1].roundName : null;
  return list.map((p) => {
    let mine = null;
    let theirs = null;
    if (p.score) {
      const parts = String(p.score).split(':').map((x) => Number(String(x).trim()));
      mine = parts[0] || 0;
      theirs = parts[1] || 0;
    }
    return {
      ...p,
      mine,
      theirs,
      isFinal: p.roundName === 'final' || p.roundName === lastRound,
      roundLabel: ROUND_CN[p.roundName] || p.roundName,
    };
  });
});

/** 这一场里冠军有没有参与（用于在完整晋级图里描边高亮） */
function involvesChampion(m) {
  if (!champion.value) return false;
  const cid = String(champion.value.albumId);
  return String(m.leftAlbum?.albumId) === cid || String(m.rightAlbum?.albumId) === cid;
}

/** ⚠️ 一律用外部 albumId 比对（winnerAlbumId 是本地 ObjectId，跟专辑对不上） */
function sideClassOf(m, album) {
  const w = winnerExternalIdOf(m);
  if (!album || w == null) return {};
  return String(album.albumId) === w ? { win: true } : { lose: true };
}
function bdgOf(m, album) {
  if (!album) return '';
  const w = winnerExternalIdOf(m);
  if (w == null) return '待投';
  return String(album.albumId) === w ? '胜' : '淘汰';
}

function sumVotes(idx) {
  let n = 0;
  for (const p of data.value?.path || []) {
    if (!p.score) continue;
    const parts = String(p.score).split(':').map((x) => Number(String(x).trim()));
    n += parts[idx] || 0;
  }
  return n;
}
const kpiRounds = computed(() => (data.value?.path || []).filter((p) => p.won).length);
const kpiMine = computed(() => sumVotes(0));
const kpiTheirs = computed(() => sumVotes(1));

async function load() {
  loading.value = true;
  try {
    // 明细只用于亚军/季军与完整晋级图，失败也不该让结果页白屏
    const [res, det] = await Promise.all([
      battleApi.result(id),
      battleApi.detail(id).catch(() => null),
    ]);
    data.value = res;
    detail.value = det;
    // 这局之前已经生成过同款签表就直接用，不再让用户点一次
    if (res?.battle?.shareCode) invite.value = { code: res.battle.shareCode };
  } catch (err) {
    ElMessage.error(err?.message || '加载失败');
    data.value = null;
  } finally {
    loading.value = false;
  }
}

onMounted(() => {
  clearResumeIf(route.params.id);
  load();
});
</script>

<style scoped>
.result {
  padding-bottom: var(--sp-7);
}

/* 折叠块（用户："完整做成一个折叠可打开查看的二级菜单那种 点击就展开看到全部"）
   用原生 <details>/<summary>：零 JS、可键盘操作、默认展开的那块内容不会藏起来。 */
.fold {
  margin-top: 20px;
  border: 1px solid var(--line);
  border-radius: var(--r-s);
  background: var(--card);
  overflow: hidden;
  /* 两边距离约束：折叠块本身不贴边、也不无限拉长 */
  max-width: 1120px;
  margin-left: auto;
  margin-right: auto;
}
.foldhd {
  display: flex;
  align-items: baseline;
  gap: 10px;
  flex-wrap: wrap;
  padding: 13px 16px;
  cursor: pointer;
  list-style: none;
  user-select: none;
}
.foldhd::-webkit-details-marker {
  display: none;
}
.foldhd b {
  font-size: 15px;
}
.foldhd span {
  font-size: 13.5px;
  color: var(--text2);
}
.foldhd .chev {
  margin-left: auto;
  width: 9px;
  height: 9px;
  border-right: 2px solid var(--text3);
  border-bottom: 2px solid var(--text3);
  transform: rotate(45deg);
  transition: transform 0.2s var(--ease-out);
}
.foldhd:hover {
  background: var(--glass2);
}
.fold[open] .foldhd {
  border-bottom: 1px solid var(--line);
}
.fold[open] .chev {
  transform: rotate(-135deg);
}
.fold > :not(summary) {
  min-width: 0;
  padding-left: 16px;
  padding-right: 16px;
}
.fold > .path,
.fold > .ko {
  padding-bottom: 16px;
}
.fold > .gstage {
  padding: 16px;
}
/* 二级折叠：嵌在「夺冠之路」里的完整晋级图（缩进由父级 .fold > :not(summary) 统一给） */
.fold.sub {
  margin: 8px 0 16px;
  max-width: none;
  background: var(--glass2);
  border-color: var(--gbd);
}
.fold.sub .foldhd {
  padding: 10px 14px;
}
.fold.sub .foldhd b {
  font-size: 15px;
}

/* 对位赛战报卡 */
.aligned-report {
  padding: 20px 22px 16px;
  border-radius: var(--r-s);
  background: var(--glass);
  border: 1px solid var(--gbd);
  /* 导出的战报图要有底：透明底在聊天软件里会糊成黑的（混战分享卡同样处理） */
  box-shadow: 0 18px 46px rgba(8, 58, 92, 0.14);
}
/* 战报头（参考混战分享卡的头部：水印一行 + 领先者大字 + 口径小字） */
.arep-top {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  margin-bottom: 10px;
}
.arep-top .stop {
  font-size: 13.5px;
  font-weight: 800;
  letter-spacing: 2px;
  color: var(--brand-deep);
}
.arep-lead {
  font-size: 26px;
  font-weight: 900;
  letter-spacing: -0.4px;
  line-height: 1.2;
}
.arep-lead b {
  color: var(--brand-deep);
}
.arep-lead .muted {
  font-size: 15px;
  font-weight: 600;
}
.arep-sub {
  margin-top: 4px;
  font-size: 14px;
  color: var(--text3);
}
/* 每一组对位：沿用混战战报的「场次标题 + 两条 pside」结构，左边留一个组号 */
.amres {
  padding: 12px 14px 10px;
  border-radius: var(--r-s);
  background: var(--glass2);
  border: 1px solid var(--line);
  margin-bottom: 10px;
}
.amres .mhd {
  margin-bottom: 9px;
}
.amres .mhd .say em {
  font-style: normal;
}
.prow {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 11px 14px;
  border-radius: 13px;
  background: var(--glass2);
  border: 1px solid var(--line);
  margin-bottom: 8px;
}
.prow b {
  font-size: 15px;
}
.prow .muted {
  font-size: 13.5px;
  color: var(--text2);
}
.prow .pv {
  margin-left: auto;
  font-size: 20px;
  font-weight: 800;
  color: var(--brand-deep);
}
.arep-foot {
  margin-top: 14px;
  padding-top: 12px;
  border-top: 1px dashed var(--line);
  font-size: 13px;
  color: var(--text3);
  text-align: center;
}
.arep-head {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 6px;
}
.ahead-main {
  font-size: 18px;
  letter-spacing: -0.3px;
}
.ahead-sub {
  font-size: 13.5px;
  color: var(--text3);
}
.awin {
  color: var(--brand-deep);
}
.asub {
  display: block;
  font-size: 13px;
  color: var(--text3);
}
.abadge {
  flex: 0 0 auto;
  font-size: 12px;
  font-weight: 800;
  color: #04263c;
  background: var(--brand);
  border-radius: 999px;
  padding: 2px 9px;
  white-space: nowrap;
}
.state {
  margin: var(--sp-8) auto;
  padding: var(--sp-6);
  max-width: 560px;
  text-align: center;
}
.btns {
  display: flex;
  gap: 10px;
  flex-wrap: wrap;
}

/* 亚军 / 季军 */
.podium {
  display: flex;
  gap: 14px;
  flex-wrap: wrap;
  margin-top: 18px;
}
.podium .pd {
  display: flex;
  gap: 12px;
  align-items: center;
  min-width: 0;
  flex: 1 1 260px;
  padding: 12px 14px;
  border-radius: var(--r-s);
  background: var(--glass);
  border: 1px solid var(--gbd);
}
.podium .pd .art {
  width: 62px;
  height: 62px;
  flex: 0 0 auto;
  border-radius: 10px;
  overflow: hidden;
  background: var(--glass2);
}
.podium .pd .art img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
}
.podium .pd .tx {
  min-width: 0;
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.podium .pd .tx b {
  font-size: 15px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.podium .pd .tx span:last-child {
  font-size: 13px;
  color: var(--text3);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.rk {
  align-self: flex-start;
  font-size: 12.5px;
  font-weight: 800;
  letter-spacing: 0.5px;
  padding: 2px 9px;
  border-radius: 999px;
}
.rk2 {
  color: #7c8b9a;
  background: rgba(124, 139, 154, 0.16);
  border: 1px solid rgba(124, 139, 154, 0.34);
}
.rk3 {
  color: #b4792f;
  background: rgba(180, 121, 47, 0.14);
  border: 1px solid rgba(180, 121, 47, 0.32);
}
.note {
  flex-basis: 100%;
  margin: 2px 0 0;
  font-size: 13px;
  color: var(--text3);
}

/* 小组赛 / 复活
   ⚠️ 原来 .gstage 用 `repeat(auto-fit, minmax(0, 1fr))` —— 没有最小列宽，
      多歌手多专辑混战出现 8 组时，8 张卡被挤成一条、每组 4 张封面缩成指甲盖、
      专辑名全被截成 2 个字（用户截图指出）。现在给列一个可读的最小宽度让它换行。 */
.gstage {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(212px, 1fr));
  gap: 12px;
}
.gsrow {
  min-width: 0;
  padding: 12px 14px;
  border-radius: var(--r-s);
  background: var(--glass);
  border: 1px solid var(--gbd);
}
.gshd {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 8px;
  margin-bottom: 10px;
}
.gshd b {
  font-size: 14.5px;
}
.gshd span {
  font-size: 13px;
  color: var(--text3);
}
.gslist {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(62px, 1fr));
  gap: 8px;
}
.gsi {
  min-width: 0;
  text-align: center;
  position: relative;
}
.gsi img {
  width: 100%;
  aspect-ratio: 1;
  object-fit: cover;
  border-radius: 8px;
  display: block;
  /* 统一置灰口径（落选 = 被淘汰，与淘汰赛 / 夺冠之路 / 晋级树同一套） */
  opacity: var(--out-opacity);
  filter: var(--out-filter);
}
.gsi span {
  display: block;
  margin-top: 4px;
  font-size: 13px;
  color: var(--text3);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.gsi i {
  position: absolute;
  right: 3px;
  top: 3px;
  font-style: normal;
  font-size: 12px;
  font-weight: 800;
  color: var(--brand-ink);
  background: var(--brand);
  border-radius: 999px;
  padding: 1px 6px;
}
/* 「淘汰」角标：中性灰，不跟「晋级」抢 */
.gsi i.out {
  color: var(--text3);
  background: rgba(120, 140, 160, 0.22);
  border: 1px solid var(--line);
}
.gsi.adv img {
  opacity: 1;
  filter: none;
  box-shadow: 0 0 0 2px rgba(14, 165, 233, 0.85);
}
.gsi.champ img {
  box-shadow: 0 0 0 2px var(--gold, #e08700);
}

/* 完整晋级图 */
.ko {
  display: grid;
  gap: 12px;
}
.koround {
  padding: 12px 14px;
  border-radius: var(--r-s);
  background: var(--glass);
  border: 1px solid var(--gbd);
}
.kohd {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 8px;
  margin-bottom: 10px;
}
.kohd b {
  font-size: 14.5px;
}
.kohd span {
  font-size: 13px;
  color: var(--text3);
}
.kom {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 40px minmax(0, 1fr);
  align-items: center;
  gap: 10px;
  padding: 7px 8px;
  border-radius: 10px;
}
.kom.mine {
  background: rgba(14, 165, 233, 0.08);
  box-shadow: inset 0 0 0 1px rgba(14, 165, 233, 0.28);
}
.kvs {
  text-align: center;
  font-size: 12.5px;
  font-weight: 800;
  color: var(--text3);
}
.kside {
  display: grid;
  grid-template-columns: 40px minmax(0, 1fr) auto auto;
  align-items: center;
  gap: 9px;
  min-width: 0;
}
.kside .art {
  width: 40px;
  height: 40px;
  border-radius: 8px;
  overflow: hidden;
  background: var(--glass2);
}
.kside .art img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
}
.kside .tx {
  min-width: 0;
}
.kside .tx b {
  display: block;
  font-size: 13.5px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.kside .tx span {
  display: block;
  font-size: 12.5px;
  color: var(--text3);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.kside .vt {
  font-size: 13.5px;
  font-weight: 700;
}
.kside .bdg {
  font-size: 12px;
  font-weight: 800;
  padding: 2px 7px;
  border-radius: 999px;
  color: var(--text3);
  background: var(--glass2);
  border: 1px solid var(--gbd);
  white-space: nowrap;
}
.kside.win .bdg {
  color: var(--brand-ink);
  background: var(--brand);
  border-color: var(--brand);
}
.kside.lose .bdg {
  color: var(--text3);
  background: var(--glass2);
  border-color: var(--line);
}
/* ⚠️ 以前是「整块 opacity:.72」—— 连名字带票数一起糊，"被淘汰的那张是谁"反而看不清。
   改成跟其它页面同一套：只灰封面 + 文字退到 --text3。 */
.kside.lose .art img {
  filter: var(--out-filter);
  opacity: var(--out-opacity);
}
.kside.lose .tx b {
  color: var(--text3);
  font-weight: 500;
}
.kside.lose .tx span {
  color: var(--text3);
}

/* 同款签表（和好友一起玩） */
.invitebox {
  margin-top: 12px;
  padding: 12px 14px;
  border: 1px dashed var(--line);
  border-radius: 12px;
  background: rgba(14, 165, 233, 0.06);
}
.invitebox .ibhd {
  display: flex;
  align-items: baseline;
  gap: 8px;
  flex-wrap: wrap;
  margin-bottom: 8px;
}
.invitebox .ibhd b {
  font-size: 15px;
}
.invitebox .ibhd span {
  font-size: 14px;
  color: var(--muted);
}
.invitebox .ibrow {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
}
.ibcode {
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  font-size: 18px;
  font-weight: 700;
  letter-spacing: 2px;
  padding: 4px 10px;
  border-radius: 8px;
  background: var(--surface-2, rgba(255, 255, 255, 0.06));
}

@media (max-width: 760px) {
  .gslist {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
  .kom {
    grid-template-columns: 1fr;
  }
  .kvs {
    display: none;
  }
}

/* ===== 简洁分享图 =====
   ⚠️ 2026-09-21 已抽成组件 `components/AlignedMiniCard.vue`（结果页与分享页共用），
      原来的 30 行样式搬去组件里了 —— 这里不要重复定义，否则改一处漏一处的老毛病又来了。 */

/* ===== 战报顶部改造（2026-09-20）===== */
.reportwrap { position: relative; }
.sharefloat {
  position: absolute;
  top: 14px;
  right: 16px;
  z-index: 5;
  display: inline-flex;
  align-items: center;
  gap: 7px;
  padding: 8px 15px;
  border-radius: 999px;
  font-size: 14px;
  font-weight: 700;
  color: var(--brand-ink);
  background: var(--brand);
  box-shadow: 0 8px 20px rgba(14, 165, 233, 0.35);
  text-decoration: none;
}
.sharefloat .ico { width: 16px; height: 16px; }
.sharefloat:hover { filter: brightness(1.06); }
.arep-score {
  display: flex;
  align-items: baseline;
  justify-content: center;
  gap: 12px;
  flex-wrap: wrap;
  margin: 6px 0 4px;
}
.arep-score .asn { font-size: 20px; font-weight: 700; }
.arep-score .asv { font-size: 42px; font-weight: 900; letter-spacing: -1.5px; color: var(--brand-deep); font-variant-numeric: tabular-nums; }
.arep-score .ascol { font-style: normal; font-size: 30px; font-weight: 700; color: var(--text3); }
.arep-vs { text-align: center; font-size: 14.5px; color: var(--text2); margin-bottom: 10px; }
.arep-vs .sep { margin: 0 8px; color: var(--text3); }
.arep-pts { display: flex; justify-content: center; flex-wrap: wrap; gap: 8px; margin-bottom: 4px; }
.aptchip { font-size: 13.5px; padding: 4px 12px; border-radius: 999px; background: var(--glass2); border: 1px solid var(--gbd); color: var(--text2); }
.aptchip b { color: var(--brand-deep); font-size: 15px; }
/* 分享图：每组左右对称的样式已随组件搬走（见 AlignedMiniCard.vue） */
</style>
