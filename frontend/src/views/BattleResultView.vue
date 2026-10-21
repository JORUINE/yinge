<template>
  <div class="result">
    <div v-if="loading" class="state muted">正在加载结果…</div>

    <template v-else-if="data">
      <!-- 对位赛 / 指定对决：没有冠军，给逐行对照战报
           ⚠️ 2026-09-20 用户点名重做："对位赛的结算图也要参考混战模式，要有专辑图片、要有设计美感，
           而且导出的战报…整个功能全部参考混战模式重做"。改法：每行不再是一行纯文字，
           而是与混战战报同款的「两张专辑（封面 + 名称 + 票数），胜方高亮」结构。 -->
      <template v-if="data.type === 'aligned'">
        <!-- ══════════ 顶部操作条（2026-09-22 用户要求）══════════
             用户："这种重要功能请你放在上面而不是最底下" ——
             以前「分享 / 保存战报 / 和好友一起玩」挤在整页最下面，
             要看完 9 组对照表滚到底才能分享。现在统一提到战报**上方**。 -->
        <div class="actbar">
          <div class="abtx">
            <b>这一局打完了</b>
            <span>存图 / 发给好友接着打，都在这一排；下面是逐组对照战报</span>
          </div>
          <div class="abbtns">
            <button class="btn pri" type="button" :disabled="exporting" @click="exportShare">
              <svg class="ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
                <path d="M12 16V4M8 8l4-4 4 4M5 20h14" />
              </svg>
              {{ exporting === 'share' ? '正在生成…' : '保存分享图' }}
            </button>
            <button class="btn ghost" type="button" :disabled="exporting" @click="exportReport">
              {{ exporting === 'full' ? '正在生成…' : '保存详细战报' }}
            </button>
            <!-- 2026-09-21 用户："每个模式都要加上这个功能" —— 对位赛以前只有"存图"，没有邀请码 -->
            <button class="btn ghost" type="button" :disabled="inviting" @click="makeInvite">
              {{ inviting ? '生成中…' : '和好友一起玩' }}
            </button>
            <RouterLink :to="{ name: 'battle-create' }" class="btn ghost">再玩一次</RouterLink>
          </div>
        </div>

        <!-- ══════════ 分享图预览（2026-10-11 第三十八批上移）══════════
             用户："还有对位赛战报这里 分享图预览应该放到最上面 放在这一局打完了下面。"
             以前它在整页最底部（要看完 N 组逐行对照表滚到底才看得到）⇒
             再上移一次：放在操作条（.actbar）**正下方**、逐行对照战报**之前**。
             仍然保持"折叠子菜单"形态（用户 2026-09-22："分享图预览做成子菜单那种形式"）。 -->
        <details class="sharefold">
          <summary class="sffhd">
            <b>分享图预览</b>
            <span>简洁版 · 大比分 + 每组一行，适合直接发群里 / 朋友圈</span>
            <i class="sfarrow">展开</i>
          </summary>
          <div class="sfbody">
            <!-- ⚠️ 2026-09-22 关键修复（用户："你的对位赛简洁战报依然是有空白"／"你是直接截图的这个部分吧"）：
                 真凶就在这个 wrapper —— 它是个**块级 div**，宽度＝父容器全宽（1200px+），
                 而卡片本身只有 720px。html2canvas 截的是这个 div，于是右边多出一大片空白被一起导出去。
                 修法：`width: fit-content` 让它贴合卡片，再加 `margin: 0 auto` 让预览居中。 -->
            <div ref="shareEl" class="shareElBox">
              <AlignedMiniCard
                :names="alignedSideNames"
                :score="alignedScore"
                :leader-text="miniLeaderText"
                :rows="data.rows || []"
              />
            </div>
          </div>
        </details>

        <!-- 同款签表：生成后直接露在操作条下面，不用再往下找 -->
        <div v-if="invite.code" class="invitebox">
          <div class="ibhd">
            <b>同款签表已生成</b>
            <span>把这串码或链接发给好友，他打开后打的是<b>完全同一批专辑、同一套对位</b></span>
          </div>
          <div class="ibrow">
            <code class="ibcode">{{ invite.code }}</code>
            <button class="mini" type="button" @click="copyInvite">复制链接</button>
            <RouterLink class="mini" :to="{ name: 'battle-join', params: { code: invite.code } }">
              查看对比
            </RouterLink>
            <!-- 2026-10-21 第五十七批：用户"添加一个撤销按钮，可以取消一起玩、回到最开始的样子" -->
            <button class="mini undo" type="button" @click="cancelInvite">撤销</button>
          </div>
        </div>

        <div class="reportwrap">
          <!-- ⚠️ 2026-09-22：原来这里有个浮动「分享 好友一起玩」按钮（当时是为了"别放最下面"）。
               现在操作条已经整体提到战报**上方**（.actbar），它就是同一个动作的重复入口 ——
               守则 103 的"逐条判去留"：**去掉**，理由＝与新操作条完全重复，留着会出现两个一模一样的按钮。
               （要恢复就把这段按钮 markup 放回来，`.sharefloat` 的样式还在。） -->

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
                <img :src="r.left?.artworkUrl" :alt="r.left?.name" loading="lazy" crossorigin="anonymous" />
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
                <img :src="r.right?.artworkUrl" :alt="r.right?.name" loading="lazy" crossorigin="anonymous" />
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

        <!-- 分享图预览已在 2026-10-11 第三十八批**再上移一次**：现在紧跟在操作条（.actbar）
             下面、逐行对照战报之前（用户："分享图预览应该放到最上面 放在这一局打完了下面"）。
             这里不再重复渲染，避免出现两个一模一样的折叠入口。 -->
      </template>

      <!-- 冠军 -->
      <template v-else-if="champion">
        <div class="crown-wrap">
          <div class="art"><img :src="champion.artworkUrl" :alt="champion.name" crossorigin="anonymous" /></div>
          <div class="cinfo">
            <div class="cw">CHAMPION · 冠军</div>
            <h3>{{ champion.name }}</h3>
            <p>{{ championMeta }}</p>
            <!-- ⚠️ 2026-10-18 第四十九批：桌面档的四个按钮留在这里（与改前完全一致）；
                 手机档移到下方独立的圆角框 `.actbox`（用户草图：下方带圆角矩形框装四个按钮）。
                 两套 DOM 用 v-if 二选一，**桌面端不会多出任何节点** ⇒ 同输入 A/B 保 0 差异。 -->
            <div v-if="!isPhone" class="btns">
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

          </div>
        </div>

        <!-- 同款签表（2026-10-21 第五十七批：**从 .cinfo 里搬出来**）
             用户截图：这个框被挤在冠军卡的信息列里，只剩一条竖窄条，非常难看；
             红框要求"扩大到和卡片差不多宽"。
             根因：它原本是 `.cinfo`（封面右侧那一列）的子元素，宽度被那一列锁死了。
             搬成 `.crown-wrap` 的兄弟节点 ⇒ 直接吃整行宽度。 -->
        <div v-if="invite.code" class="invitebox wide">
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
            <!-- 2026-10-21 第五十七批：用户"添加一个撤销按钮，可以取消一起玩、回到最开始的样子" -->
            <button class="mini undo" type="button" @click="cancelInvite">撤销</button>
          </div>
        </div>

        <!-- ⭐ 2026-10-18 第四十九批：手机档的操作区（用户草图）
             "下方用一个带圆角的矩形框 然后把生成夺冠之路 再来一次 和好友一起玩 收藏
              依次按照我画的位置摆放 然后文字都尽量在一行 不要换行"
             顺序＝生成夺冠之路 / 再来一次 / 和好友一起玩 / 收藏，2×2 网格；
             每个按钮 nowrap，文字绝不折行。桌面档不渲染这一块（按钮仍在 .cinfo 里）。 -->
        <div v-if="isPhone" class="actbox">
          <RouterLink :to="{ name: 'battle-share', params: { id } }" class="actbtn pri">
            <svg class="ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
              <path d="M12 16V4M8 8l4-4 4 4M5 20h14" />
            </svg>
            生成夺冠之路
          </RouterLink>
          <RouterLink :to="{ name: 'battle-create' }" class="actbtn">再来一次</RouterLink>
          <button class="actbtn" type="button" :disabled="inviting" @click="makeInvite">
            {{ inviting ? '生成中…' : '和好友一起玩' }}
          </button>
          <FavoriteButton :album="champion" />
        </div>

        <!-- 亚军 / 季军（守则 19）：亚军=决赛负方；季军=四强落败者中累计得票更高者 -->
        <div v-if="podium.runnerUp || podium.third" class="podium">
          <div v-if="podium.runnerUp" class="pd">
            <div class="art"><img :src="podium.runnerUp.artworkUrl" :alt="podium.runnerUp.name" crossorigin="anonymous" /></div>
            <div class="tx">
              <span class="rk rk2">亚军</span>
              <b>{{ podium.runnerUp.name }}</b>
              <span>{{ podium.runnerUp.artistName }} · {{ year(podium.runnerUp.releaseDate) }}</span>
            </div>
            <FavoriteButton :album="podium.runnerUp" icon-only small />
          </div>
          <div v-if="podium.third" class="pd">
            <div class="art"><img :src="podium.third.artworkUrl" :alt="podium.third.name" crossorigin="anonymous" /></div>
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

        <!--
          2026-09-19 用户定稿的折叠顺序，2026-10-21 第五十六批**用户要求改序**：
            完整晋级图 → 小组赛与复活 → 夺冠之路 → 淘汰赛
          用户原话：「完整晋级图模块排到小组赛与复活上面，默认不展开，
                    手机端的完整晋级图应该做成子菜单形式展开」「现在这种根本无法看全」。
        -->

        <!-- 完整晋级图
             ⚠️ 手机档（≤640）与桌面档是**两套 DOM**（v-if 互斥），不是"两套都渲染靠 CSS 切"：
               第四十七批的教训 —— 都渲染会让桌面 DOM 多出节点，A/B 直接报差异。
             · 桌面档：仍是原来的 `<details class="fold">`，就地展开，结构一字未改。
             · 手机档：改成**子菜单行** → 点开是一个全屏子页（Teleport 到 body）。
               为什么必须换：晋级树的内容宽 = 第一轮并排几张卡 × 卡宽，16 张专辑就 1500px+，
               塞进结算页那张卡里只能横着拖，永远"看不全"（用户截图就是这条）。
               全屏子页拿到整屏宽度，再加「适应宽度」自动缩放 ⇒ 一屏看得全。
             默认**都不展开**（桌面 details 不加 open；手机要点了才开）。 -->
        <details v-if="!isPhone && koRounds.length" class="fold">
          <summary class="foldhd">
            <b>完整晋级图</b>
            <span>竖版看完整条淘汰赛路径 · 小封面小字 · 可导出分享</span>
            <i class="chev" aria-hidden="true"></i>
          </summary>
          <BracketTree
            :matches="allMatches"
            :champion="champion"
            compact
            initial-dir="v"
            :total-albums="battlePool"
            :total-artists="battleArtists"
          />
        </details>

        <!-- 手机档：子菜单形式的入口行（长得和折叠头一样，点开进全屏子页） -->
        <button
          v-if="isPhone && koRounds.length"
          type="button"
          class="foldhd submenu-link"
          @click="openBracket"
        >
          <b>完整晋级图</b>
          <span>全屏查看 · 自动适应宽度 · 可导出分享</span>
          <i class="chev" aria-hidden="true"></i>
        </button>

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
                  <img :src="al.artworkUrl" :alt="al.name" loading="lazy" crossorigin="anonymous" />
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
              <div class="art"><img :src="champion.artworkUrl" :alt="champion.name" crossorigin="anonymous" /></div>
              <div class="tx">
                <b>{{ champion.name }}</b>
                <span>{{ champion.artistName }} · {{ year(champion.releaseDate) }}</span>
              </div>
              <div class="pc" v-if="row.mine">{{ row.mine }} 票</div>
              <div class="pc zero" v-else>未得一票</div>
              <span class="bw">胜</span>
            </div>

            <div class="pside lose" v-if="row.opponent">
              <div class="art"><img :src="row.opponent.artworkUrl" :alt="row.opponent.name" crossorigin="anonymous" /></div>
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
                  <div class="art"><img :src="m.leftAlbum?.artworkUrl" :alt="m.leftAlbum?.name" loading="lazy" crossorigin="anonymous" /></div>
                  <div class="tx">
                    <b>{{ m.leftAlbum?.name || '—' }}</b>
                    <span>{{ m.leftAlbum?.artistName || '' }}</span>
                  </div>
                  <div class="vt num" :class="{ zero: !m.leftVotes }">{{ m.leftVotes || 0 }} 票</div>
                  <span class="bdg">{{ bdgOf(m, m.leftAlbum) }}</span>
                </div>
                <div class="kvs">VS</div>
                <div class="kside" :class="sideClassOf(m, m.rightAlbum)">
                  <div class="art"><img :src="m.rightAlbum?.artworkUrl" :alt="m.rightAlbum?.name" loading="lazy" crossorigin="anonymous" /></div>
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

    <!--
      手机端「完整晋级图」的全屏子页（Teleport 到 body）
      ------------------------------------------------------------
      为什么要 Teleport：结算页外层有卡片/玻璃层的 stacking context，
      `position: fixed` 会被祖先的 `transform / filter / backdrop-filter` 抓住
      ⇒ 弹出来的不是"贴在视口上"，而是贴在祖先里，还会被 `overflow` 裁掉。
      挂到 body 上才能真正占满整屏。
    -->
    <Teleport to="body">
      <div v-if="bracketOpen" class="brksheet" role="dialog" aria-modal="true" aria-label="完整晋级图">
        <div class="brkbar">
          <button type="button" class="brkback" @click="closeBracket">
            <i class="bk" aria-hidden="true"></i>返回
          </button>
          <b class="brkt">完整晋级图</b>
          <div class="brkseg" role="tablist" aria-label="晋级图缩放">
            <button type="button" role="tab" :aria-selected="brkAuto" :class="{ on: brkAuto }" @click="fitBracket">适应宽度</button>
            <button type="button" role="tab" :aria-selected="!brkAuto" :class="{ on: !brkAuto }" @click="resetBracket">原始大小</button>
          </div>
        </div>
        <div ref="brkScrollEl" class="brkbody">
          <div class="brkinner" :style="brkInnerStyle">
            <BracketTree
              :matches="allMatches"
              :champion="champion"
              compact
              initial-dir="v"
              :total-albums="battlePool"
              :total-artists="battleArtists"
              :before-export="beginBracketExport"
            />
          </div>
        </div>
      </div>
    </Teleport>
  </div>
</template>

<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, ref } from 'vue';
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
import { exportAndSave } from '@/utils/saveImage.js';

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

/**
 * 是否手机档（≤640）—— 决定结算页按钮**用哪套 DOM**
 * ------------------------------------------------------------
 * 用户草图（2026-10-18 确认理解正确）：封面在左上、歌手与专辑名位置不变，
 * **下方用一个带圆角的矩形框**装四个按钮（生成夺冠之路 / 再来一次 / 和好友一起玩 / 收藏），
 * 按钮文字尽量一行不换行。
 * ⚠️ 桌面端的四个按钮原本在 `.cinfo` 信息列里（横排 wrap）。要让它们在手机档
 *    "横跨整行、独立成框"，必须把按钮从 `.cinfo` 里**挪出来** —— 纯 CSS 做不到。
 *    所以在桌面端**仍然渲染旧结构**（v-if="!isPhone"），手机端才渲染 `.actbox`。
 *    ⚠️ 教训来自第四十七批：两套都渲染只靠 CSS 切，会让桌面 DOM 多出节点 ⇒ A/B 报差异。
 */
const isPhone = ref(false);
let mqPhone = null;
let mqPhoneHandler = null;

/**
 * 手机端「完整晋级图」全屏子页（2026-10-21 第五十六批）
 * ------------------------------------------------------------
 * 用户：「手机端的完整晋级图应该做成子菜单形式展开」「现在这种根本无法看全」。
 * 就地展开看不全的根因：晋级树的内容宽 = 第一轮并排几张卡 × 卡宽（16 张专辑 1500px+），
 * 塞在结算页那张卡里只能横向拖。⇒ 全屏子页拿整屏宽度 + 「适应宽度」自动缩放。
 *
 * ⚠️ 缩放用 CSS `zoom` 而不是 `transform: scale()`：
 *    `scale` 只改绘制、不改布局 ⇒ 缩完四周会留出一圈空白、还得手动补偿高度；
 *    `zoom` 会**真实重排**，宽高一起缩，不用补。移动端的 Chromium / WebKit 都支持。
 */
const bracketOpen = ref(false);
const brkAuto = ref(true);
const brkZoom = ref(1);
const brkScrollEl = ref(null);
let brkRO = null;

const brkInnerStyle = computed(() => ({ zoom: brkZoom.value }));

/** 量一次「内容需要多宽 / 容器有多宽」，算出能一屏放下的缩放比 */
function measureBracket() {
  const box = brkScrollEl.value;
  if (!box) return;
  const inner = box.querySelector('.bshot') || box.firstElementChild;
  if (!inner) return;
  const avail = box.clientWidth;
  const need = inner.scrollWidth || inner.offsetWidth || 0;
  // ⚠️ 除零 / 非数保护：容器还没布局出来（0）或内容宽取不到时，**保持 1** 而不是算出 Infinity/NaN
  if (!Number.isFinite(avail) || !Number.isFinite(need) || avail <= 0 || need <= 0) return;
  const z = avail / need;
  if (!Number.isFinite(z) || z <= 0) return;
  // 下限 0.28：再小字就读不清了（不如让用户横着拖）；上限 1：小图没必要放大
  brkZoom.value = Math.min(1, Math.max(0.28, Math.round(z * 1000) / 1000));
}

/** 内容宽度一变（比如用户切竖版/横版）就重新适应 —— 比让用户手动再点一次省事 */
function watchBracketWidth() {
  const box = brkScrollEl.value;
  const inner = box?.querySelector('.bshot');
  brkRO?.disconnect();
  brkRO = null;
  if (!inner || typeof ResizeObserver === 'undefined') return;
  brkRO = new ResizeObserver(() => {
    if (brkAuto.value) measureBracket();
  });
  brkRO.observe(inner);
}

async function openBracket() {
  bracketOpen.value = true;
  // 打开期间锁住背景滚动（子页自己滚）
  document.body.style.overflow = 'hidden';
  await nextTick();
  // 等一帧：BracketTree 刚挂载，此刻才有真实宽度
  requestAnimationFrame(() => {
    measureBracket();
    watchBracketWidth();
  });
}

function closeBracket() {
  bracketOpen.value = false;
  document.body.style.overflow = '';
  brkRO?.disconnect();
  brkRO = null;
}

function fitBracket() {
  brkAuto.value = true;
  measureBracket();
}

function resetBracket() {
  brkAuto.value = false;
  brkZoom.value = 1;
}

/**
 * 导出前把"只为了在手机小屏上观看"的 zoom 临时归 1
 * ------------------------------------------------------------
 * ⚠️ 2026-10-21 第五十七批：用户保存的晋级图右侧被截、封面错位。
 *   根因：`zoom` 加在 `.brkinner`（导出目标的**祖先**）上，
 *   而导出是克隆 `.bshot` + 内联 computed style ⇒ **祖先的 zoom 根本不在克隆树里**。
 *   结果：看得见的宽度＝382×zoom，导出来的宽度＝382 ⇒ 比例尺不一致、右边被切。
 *   ⇒ 导出前归 1（这时 `.bshot` 会回到 max-content，与桌面端导出完全同一条路），
 *     导出后还原。返回的还原函数由 BracketTree 在 finally 里调用。
 */
async function beginBracketExport() {
  const prev = brkZoom.value;
  brkZoom.value = 1;
  await nextTick();
  return () => {
    brkZoom.value = prev;
  };
}
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

/**
 * 撤销「和好友一起玩」（2026-10-21 第五十七批 · 用户明确要求）
 * ------------------------------------------------------------
 * 用户：「添加一个撤销按钮，就是用户可以取消一起玩，回到最开始的样子」。
 * 只清**本地**状态：邀请码本来就没发出去（页面上也没露给别人），
 * 清掉后按钮回到「和好友一起玩」，页面结构与生成前完全一致。
 * ⚠️ 后端那条记录不删 —— 那是"同款签表"的快照，别人拿不到码就进不来；
 *    真删会连带影响已经分享出去的链接（如果用户其实已经发出去了）。
 */
function cancelInvite() {
  invite.value = { code: '' };
  ElMessage.info('已撤销，好友将无法再用这个码进入');
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
/**
 * 导出战报 / 分享图（2026-10-17 第四十五批重写）
 * ------------------------------------------------------------
 * ⚠️ 用户真机实测（iOS）："显示下载到本地了 但是我实测没有"。
 *   旧实现 `<a download>` + `ElMessage.success('已保存到下载文件夹')` 在 iOS/微信里
 *   **根本不保存，但提示照弹** ⇒ 用户以为存好了。
 *   另外旧实现用的是 html2canvas（自带布局引擎，会丢间距），现统一换成
 *   utils/saveImage.js 的 exportAndSave：真渲染 + 移动端三级降级下载。
 */
async function exportImage(el, filename, mode) {
  await exportAndSave(el, filename, { exporting, busyValue: mode, bg: '#f7fbfe' });
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

/**
 * 整局的专辑数 / 歌手数 —— 给晋级图导出海报的页脚用。
 * ⚠️ 不能从淘汰赛场次里去数：8 张专辑的局常常只有 4 张打进淘汰赛，
 *    数出来会和页面其它地方「8 张专辑」的口径打架（"4 张专辑"看着像数据错了）。
 */
const battlePool = computed(() => data.value?.battle?.poolTarget || 0);
const battleArtists = computed(() => (data.value?.battle?.artists || []).length);

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
  // 手机档判定（决定结算页按钮用哪套 DOM，见 isPhone 注释）
  mqPhone = window.matchMedia('(max-width: 640px)');
  isPhone.value = mqPhone.matches;
  // ⚠️ 存住函数引用：卸载时才能真的 removeEventListener（传一个新的 ()=>{} 是摘不掉的）
  mqPhoneHandler = (e) => { isPhone.value = e.matches; };
  mqPhone.addEventListener?.('change', mqPhoneHandler);
});

// 组件卸载时把「晋级图全屏子页」留下的副作用清干净（否则会锁住整页滚动）
onBeforeUnmount(() => {
  mqPhone?.removeEventListener?.('change', mqPhoneHandler);
  brkRO?.disconnect();
  brkRO = null;
  if (bracketOpen.value) document.body.style.overflow = '';
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
  /* 子项已设为 nowrap（见下）⇒ 放不下时在**元素之间**换行，而不是把一行字劈开 */
  flex-wrap: wrap;
  margin-bottom: 10px;
}
.arep-top .stop {
  font-size: 13.5px;
  font-weight: 800;
  letter-spacing: 2px;
  color: var(--brand-deep);
}
/* ⚠️ 2026-10-21 第五十六批：用户"对位赛战报手机端保存下来，上面字体产生了问题"。
   导出走的是「克隆 → 内联 computed style → SVG foreignObject」，
   克隆体在**另一个文档**里渲染，字体度量与页面可能差零点几像素。
   而弹性布局的子项默认是 `flex: 0 0 auto` 之外的自动尺寸 ⇒ 差一点就在**文字内部**
   换行/压缩 ⇒ 保存下来看着就是"字挤在一起 / 排版错乱"（第五十五批在分享卡上栽过一次）。
   ⇒ 顶部这四块的所有子项一律：**不许内部换行、不许被压缩**；
     真的放不下时由容器 `flex-wrap` 在**元素之间**换行，而不是把一行字劈开。
   这条不改页面观感（宽度够的时候完全一样），只是让导出对字体差异免疫。 */
.arep-top .stop,
.arep-top .pillx,
.arep-score > *,
.arep-vs,
.arep-pts .aptchip {
  flex: 0 0 auto;
  min-width: 0;
  white-space: nowrap;
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

/* ═══════════════════════════════════════════════════════════════════════
 * 2026-10-18 第四十九批 · 结算页操作区（手机档，按用户草图）
 * ---------------------------------------------------------------------
 * 用户原话："结算页应该像我新画的这个布局一样专辑图片左上角 然后原本的歌手和专辑
 *   名字位置不变 然后下方用一个带圆角的矩形框 然后把生成夺冠之路 再来一次
 *   和好友一起玩 收藏 依次按照我画的位置摆放 然后文字都尽量在一行 不要换行"
 *
 * 结构：一个圆角玻璃框，里面 2×2 网格放四个操作。
 *  ⚠️ 只渲染在手机档（模板 v-if="isPhone"）——桌面档的四按钮仍在 .cinfo 里，结构未动。
 * ⚠️ 每个按钮 `white-space: nowrap`：文字**绝不折行**；实在放不下时用省略号，
 *    而不是掉成两行把框撑高（用户明确要求"文字都尽量在一行"）。
 * ═══════════════════════════════════════════════════════════════════════ */
.actbox {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px;
  margin-top: 14px;
  padding: 12px;
  border-radius: 20px;
  background: var(--glass);
  border: 1px solid var(--gbd);
  backdrop-filter: blur(18px) saturate(180%);
  -webkit-backdrop-filter: blur(18px) saturate(180%);
  box-shadow: 0 10px 28px rgba(8, 58, 92, 0.14);
}
.actbtn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  min-width: 0;
  min-height: 46px;
  padding: 0 10px;
  border: 1px solid var(--gbd);
  border-radius: 13px;
  background: var(--glass2);
  color: var(--text);
  font-size: 13.5px;
  font-weight: 700;
  line-height: 1.2;
  text-decoration: none;
  /* 文字一行，绝不折行 */
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  cursor: pointer;
  -webkit-tap-highlight-color: transparent;
}
.actbtn:active:not(:disabled) {
  transform: scale(0.975);
}
.actbtn:disabled {
  opacity: 0.6;
}
.actbtn.pri {
  border-color: transparent;
  background: linear-gradient(160deg, #f0a63a, #d97b00);
  color: #fff;
  box-shadow: 0 8px 20px rgba(217, 123, 0, 0.34);
}
.actbtn .ico {
  width: 15px;
  height: 15px;
  flex: 0 0 auto;
}
/* 收藏按钮在框里也统一成同款按钮外观。
   ⚠️ 用 !important：FavoriteButton 是独立组件，它的 `.favbtn` 也带 scoped 属性，
      特异性与本规则打平（都是 0,2,0），谁后加载谁赢 —— 不可控。
      这里是"在特定容器里改子组件外观"的典型场景，用 !important 是明确且安全的做法。 */
.actbox :deep(.favbtn) {
  min-height: 46px !important;
  border-radius: 13px !important;
  border: 1px solid var(--gbd) !important;
  background: var(--glass2) !important;
  font-size: 13.5px !important;
  font-weight: 700 !important;
  white-space: nowrap !important;
  width: 100%;
  justify-content: center;
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
  grid-template-columns: repeat(auto-fill, minmax(min(212px, 100%), 1fr));
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
  grid-template-columns: repeat(auto-fill, minmax(min(62px, 100%), 1fr));
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
/* 放大版（冠军卡下方那一块）：原来是 `.cinfo` 的子元素，被信息列锁成一个竖窄条 */
.invitebox.wide {
  margin-top: 16px;
  padding: 14px 16px;
}
.invitebox.wide .ibhd b {
  font-size: 15.5px;
}
.invitebox.wide .ibrow {
  gap: 10px 12px;
}
/* 「撤销」：低对比、不抢主操作，但要一眼能找到（用户"取消一起玩、回到最开始的样子"） */
.invitebox .mini.undo {
  margin-left: auto;
  color: var(--text3);
  border-color: var(--line);
  background: transparent;
}
.invitebox .mini.undo:hover {
  color: #B45309;
  border-color: rgba(180, 83, 9, 0.4);
  background: rgba(180, 83, 9, 0.06);
}
@media (max-width: 640px) {
  /* 手机上「撤销」单独占一行右对齐，避免和「查看对比」挤在一起换行换得很乱 */
  .invitebox .ibrow .mini.undo {
    margin-left: 0;
  }
  .invitebox.wide .ibrow {
    gap: 8px;
  }
}

/* 手机档（≤640）：小组 2 列、淘汰赛单列、隐藏比分分隔符（原 760） */
@media (max-width: 640px) {
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

/* =====================================================================
   顶部操作条 + 分享图折叠预览（2026-09-22 用户要求）
   ---------------------------------------------------------------------
   用户原话："这种重要功能请你放在上面而不是最底下，分享图预览做成子菜单那种形式"。
   以前：战报（对位赛可能有 9+ 组）→ 分享图预览 → 按钮组 → 邀请码，全堆在页尾，
        要分享得先滚到底。现在操作条上移到战报之上，预览收进折叠块。
   ===================================================================== */
.actbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 18px;
  flex-wrap: wrap;
  margin: 4px 0 16px;
  padding: 16px 20px;
  border-radius: var(--r);
  border: 1px solid rgba(14, 165, 233, 0.34);
  background: linear-gradient(100deg, rgba(14, 165, 233, 0.12), var(--glass2) 62%);
  box-shadow: var(--shadow-2);
}
.actbar .abtx {
  flex: 1 1 260px;
  min-width: 0;
}
.actbar .abtx b {
  display: block;
  font-size: 18px;
  letter-spacing: -0.3px;
}
.actbar .abtx span {
  display: block;
  margin-top: 4px;
  font-size: 13.5px;
  line-height: 1.65;
  color: var(--text2);
}
.actbar .abbtns {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
}
/* 分享图预览：折叠子菜单 */
.sharefold {
  margin: 18px 0 4px;
  border: 1px solid var(--gbd);
  border-radius: var(--r);
  background: var(--glass2);
  overflow: hidden;
}
.sharefold .sffhd {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 13px 18px;
  cursor: pointer;
  list-style: none;
  user-select: none;
}
.sharefold .sffhd::-webkit-details-marker {
  display: none;
}
.sharefold .sffhd b {
  font-size: 15.5px;
  flex: 0 0 auto;
}
.sharefold .sffhd span {
  flex: 1;
  min-width: 0;
  font-size: 13.5px;
  color: var(--text2);
}
.sharefold .sfarrow {
  flex: 0 0 auto;
  font-style: normal;
  font-size: 13.5px;
  font-weight: 600;
  color: var(--brand-deep);
}
.sharefold[open] .sfarrow {
  color: var(--text3);
}
.sharefold .sfbody {
  padding: 0 18px 18px;
}
.sharefold .sffhd:hover {
  background: rgba(14, 165, 233, 0.06);
}

/* 导出范围修正：wrapper 贴合卡片宽度并居中，否则导出图会带上右侧一大片空白 */
.shareElBox {
  width: fit-content;
  max-width: 100%;
  margin: 0 auto;
}
.sfbody {
  display: flex;
  justify-content: center;
}

/* ─────────────────────────────────────────────────────────────
   手机端「完整晋级图」：子菜单入口行 + 全屏子页
   2026-10-21 第五十六批（用户："做成子菜单形式展开""现在这种根本无法看全"）
   ⚠️ 全部只在手机档生效：桌面档走的是原来的 `<details class="fold">`，
      这里的类名桌面 DOM 里根本不存在 ⇒ 桌面 A/B 不受影响。
   ───────────────────────────────────────────────────────────── */

/* ① 子菜单入口行：长得和折叠头一模一样（复用 .foldhd 的排版），
      只补上按钮该有的外观复位（`button` 默认有边框/背景/字体） */
.submenu-link {
  display: flex;
  width: 100%;
  margin: 14px auto 0;
  text-align: left;
  font: inherit;
  color: var(--text);
  background: var(--glass);
  border: 1px solid var(--gbd);
  border-radius: var(--r-s, 14px);
  box-shadow: var(--gsh, 0 10px 30px rgba(8, 58, 92, 0.08));
}
.submenu-link:active {
  background: var(--glass2);
}
.submenu-link .chev {
  /* 入口行是"进子页"，箭头朝右（.foldhd 的箭头是朝下的展开态） */
  transform: rotate(-45deg);
  align-self: center;
}

/* ② 全屏子页 */
.brksheet {
  position: fixed;
  inset: 0;
  z-index: 300;
  display: flex;
  flex-direction: column;
  /* 子页要有实心底：晋级图本身是透明卡片，压在页面深色氛围上会糊 */
  background: var(--bg, #f2f7fb);
  padding-top: env(safe-area-inset-top, 0px);
  padding-bottom: env(safe-area-inset-bottom, 0px);
}
.brkbar {
  display: flex;
  align-items: center;
  gap: 10px;
  flex: 0 0 auto;
  padding: 10px 12px;
  border-bottom: 1px solid var(--line, rgba(8, 58, 92, 0.12));
  background: var(--glass);
}
.brkbar .brkt {
  font-size: 15px;
  font-weight: 900;
  color: var(--text);
  white-space: nowrap;
}
.brkback {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  flex: 0 0 auto;
  padding: 7px 12px 7px 8px;
  font: inherit;
  font-size: 13.5px;
  font-weight: 800;
  color: var(--text2);
  background: var(--glass2);
  border: 1px solid var(--gbd);
  border-radius: 999px;
}
.brkback .bk {
  width: 8px;
  height: 8px;
  border-left: 2px solid currentColor;
  border-bottom: 2px solid currentColor;
  transform: rotate(45deg);
}
.brkseg {
  display: inline-flex;
  margin-left: auto;
  flex: 0 0 auto;
  padding: 3px;
  border-radius: 999px;
  background: var(--glass2);
  border: 1px solid var(--gbd);
}
.brkseg button {
  border: 0;
  background: transparent;
  color: var(--text2);
  font: inherit;
  font-size: 12.5px;
  font-weight: 800;
  padding: 5px 10px;
  border-radius: 999px;
  white-space: nowrap;
}
.brkseg button.on {
  background: var(--brand);
  color: #fff;
}
.brkbody {
  flex: 1 1 auto;
  min-height: 0;
  overflow: auto;
  -webkit-overflow-scrolling: touch;
  padding: 10px 10px calc(20px + env(safe-area-inset-bottom, 0px));
}
/* `zoom` 由 JS 写在这里（真实重排，宽高一起缩，不用补高度） */
.brkinner {
  transform-origin: top left;
}

/* ── ③ 竖版清单在子页里改成**流式宽度** ──────────────────────────
   `.blist.compact` 写死了 640px（为了导出尺寸可预期），在 390 的屏上只能靠
   zoom 0.61 缩 ⇒ 12px 的专辑名被压到 **7.3px**，违反「任何文字 ≥12px」。
   改成流式后内容宽 = 屏宽 ⇒ zoom 回到 1，字号保持原大小、也仍然一屏看得全。
   ⚠️ 两条都带上 `.bshot.exporting`：导出那一瞬间 BracketTree 会给 `.bshot`
      加 `width: max-content`，若被它赢走，百分比宽度就会退化成"按内容撑"，
      又把 640px 撑回来。这里用 `.brksheet .bshot.exporting`（0,3,0）压过它。 */
/* ⚠️ 2026-10-21 第五十七批：这两条只在**观看态**生效（`:not(.exporting)`）。
   导出那一瞬间 BracketTree 会给 `.bshot` 加 `.exporting`，那时必须回到
   `width: max-content` + `.blist.compact` 的 640px —— 让导出走**和桌面端完全同一条路**。
   之前我用 `.bshot.exporting` 也强制 100%，结果导出来的内容被挤进 382px，
   用户看到的就是"右侧被截、封面错位"的严重错误。 */
.brksheet :deep(.bshot:not(.exporting)) {
  display: block;
  width: 100%;
}
.brksheet :deep(.bshot:not(.exporting) .blist.compact) {
  width: 100%;
}
</style>
