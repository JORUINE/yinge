<template>
  <div class="create">
    <div class="page-head">
      <p class="eyebrow">创建对决</p>
      <h1>选个模式，开一局</h1>
      <p class="muted sub">
        两种玩法：<b>混战模式</b>把不同歌手的专辑丢进同一个池子随机厮杀（默认首选）；
        <b>对位模式</b>两两一组、按规则对应着打 —— 指定对决就属于这一族。
      </p>
    </div>

    <!-- 本地续玩：进来就想开新局的人，先告诉他"你还有一局没打完" -->
    <ResumeBar />

    <!-- ⭐ 大框（2026-09-24 第十四批）
         用户原话："之前的 ui 原型…至少是在一个大框里 有分板块的小框 而且做了边角的圆弧设计 有苹果质感"
         所以把「模式大厅 → 各选项板块 → 开始条」全部收进**一个**圆角玻璃大框里，
         里面每个板块是一块**轻质分区面**（不是第二个重卡片）—— 既有"分板块"，又不会变成卡套卡。 -->
    <div class="stage">
      <!-- 模式大厅（2026-09-19 用户定稿）：混战 / 对位 两大模式，像游戏等待大厅那样选。
           ⚠️ 只重排 UI，底层 mode 值与全部现有逻辑保持不变 -->
      <div class="lobby">
      <section
        v-for="g in LOBBY"
        :key="g.key"
        class="lobbybox"
        :class="[g.key, { active: lobbyKeyOf(mode) === g.key }]"
      >
        <header class="lb-hd">
          <span class="lb-ico">{{ g.icon }}</span>
          <div class="lb-tx">
            <b>{{ g.name }}<span class="lbt">{{ g.tag }}</span></b>
            <span>{{ g.intro }}</span>
          </div>
        </header>
        <div class="lb-modes">
          <button
            v-for="m in g.modes"
            :key="m.value"
            class="mode"
            :class="{ on: mode === m.value }"
            type="button"
            @click="pickMode(m.value)"
          >
            <b>{{ m.label }}<span v-if="m.badge" class="badge">{{ m.badge }}</span></b>
            <span>{{ m.desc }}</span>
          </button>
        </div>
      </section>
    </div>

    <!-- 对位赛说明（仅对位赛模式展开） -->
    <div v-if="mode === 'aligned'" class="alignbox">
      <div class="ah">
        <b>对位赛长什么样</b>
        <span>选 2 至 4 位歌手 · 按发行先后逐张对位 · 胜场积分制</span>
      </div>
      <div class="arow">
        <div class="k">第 1 张</div>
        <div class="nm">David Tao · 1997</div>
        <div class="sc" style="color: var(--brand)">14 : 6</div>
        <div class="nm">Jay · 2000</div>
        <div class="wn">陶喆 胜</div>
      </div>
      <div class="arow">
        <div class="k">第 2 张</div>
        <div class="nm">I'm OK · 1999</div>
        <div class="sc" style="color: var(--text3)">9 : 11</div>
        <div class="nm">范特西 · 2001</div>
        <div class="wn">周杰伦 胜</div>
      </div>
      <div class="arow hi">
        <div class="k">第 3 张</div>
        <div class="nm">黑色柳丁 · 2002</div>
        <div class="sc" style="color: var(--brand)">12 : 8</div>
        <div class="nm">八度空間 · 2002</div>
        <div class="wn">陶喆 胜</div>
      </div>
      <div class="af">
        逐张取各自发行顺序的第 k 张，同序号互相比 —— 回答的是"两位歌手同阶段的作品谁更强"。<br />
        与混战模式的区别：混战会打乱专辑序号，首张专辑可能对上对方第五张，比较失去意义。<br />
        胜负按 <b>胜场积分</b> 统计，不用淘汰制，否则第 3 张的胜者没有第 4 张对手，赛程会断裂。
      </div>
    </div>

    <!-- 指定对决：逐组排对阵表 -->
    <template v-if="mode === 'duel'">
      <div class="block">
        <h4>排对阵表 <em>逐组指定谁打谁，可跨歌手</em></h4>
        <div class="searchrow">
          <input
            v-model="duelTerm"
            class="ipt"
            placeholder="先搜歌手，再从 TA 的专辑里挑，如 陶喆 / 周杰伦"
            @keyup.enter="duelSearch"
          />
          <button class="btn pri sm" type="button" :disabled="duelSearching" @click="duelSearch">
            {{ duelSearching ? '搜索中…' : '搜索' }}
          </button>
        </div>

        <div v-if="duelCandidates.length" class="chips" style="margin-top: 12px">
          <ArtistChip
            v-for="a in duelCandidates"
            :key="a.artistId"
            :artist="a"
            :on="duelArtists.some((x) => x.artistId === a.artistId)"
            :taken="a.taken"
            :action="duelArtists.some((x) => x.artistId === a.artistId) ? '已载入' : '加入候选池'"
            @pick="loadDuelAlbums"
          />
        </div>

        <!-- 已载入歌手单独一排：指定对决要能跨歌手，不然只能"自己打自己" -->
        <div v-if="duelArtists.length" class="pickedrow">
          <span class="pickedlab">已载入 {{ duelArtists.length }} 位歌手的专辑</span>
          <div class="chips">
            <span v-for="a in duelArtists" :key="a.artistId" class="chip on">
              <b>{{ a.name }}</b>
              <span class="x" @click.stop="removeDuelArtist(a.artistId)">×</span>
            </span>
          </div>
        </div>

        <template v-if="duelAlbums.length">
          <p class="hint">{{ duelHint }}</p>

          <!-- 待成组托盘：选了 1 张时明确告诉你"还差 1 张"，不再是点了没反应 -->
          <div v-if="currentPair.length" class="pending">
            <span class="pickedlab">待成组 {{ currentPair.length }} / 2</span>
            <div class="chips">
              <span v-for="al in currentPair" :key="al.albumId" class="chip on">
                <img :src="al.artworkUrl" :alt="al.name" class="chipart" />
                <b>{{ al.name }}</b>
                <span class="x" @click.stop="unpickDuelAlbum(al)">×</span>
              </span>
            </div>
            <button class="mini" type="button" @click="currentPair = []">清空</button>
          </div>

          <div class="pool">
            <button
              v-for="al in duelAlbums"
              :key="al.albumId"
              class="pk duelpk"
              :class="{ pick: isPending(al), done: isPaired(al) }"
              type="button"
              :disabled="isPaired(al)"
              @click="addDuelAlbum(al)"
            >
              <div class="art">
                <img :src="al.artworkUrl" :alt="al.name" loading="lazy" />
                <span class="ck"><svg viewBox="0 0 24 24"><path d="M9 16.2L4.8 12l-1.4 1.4L9 19 21 7l-1.4-1.4z" /></svg></span>
              </div>
              <b>{{ al.name }}</b><span>{{ year(al.releaseDate) }}</span>
            </button>
          </div>
        </template>

        <div v-if="pairs.length" class="pairlist">
          <div v-for="(p, i) in pairs" :key="i" class="pairrow">
            <span class="k">第 {{ i + 1 }} 组</span>
            <span class="pcell">
              <img :src="p[0].artworkUrl" :alt="p[0].name" loading="lazy" />
              <span class="nm">{{ p[0].name }}</span>
            </span>
            <span class="vs-mini">VS</span>
            <span class="pcell">
              <img :src="p[1].artworkUrl" :alt="p[1].name" loading="lazy" />
              <span class="nm">{{ p[1].name }}</span>
            </span>
            <em v-if="p[0].artistId === p[1].artistId" class="sibflag">同室操戈</em>
            <button class="mini-x" type="button" @click="removePair(i)">移除</button>
          </div>
        </div>
      </div>
    </template>

    <!-- 手动挑选：逐张勾专辑 -->
    <template v-else-if="mode === 'custom'">
      <div class="block">
        <h4>手动挑选 <em>至少 4 张 · 最多 100 张 · 可跨歌手</em></h4>
        <div class="searchrow">
          <input
            v-model="term"
            class="ipt"
            placeholder="输入歌手名，如 周杰伦 / 陶喆"
            @keyup.enter="doSearch"
          />
          <button class="btn pri sm" type="button" :disabled="searching" @click="doSearch">
            {{ searching ? '搜索中…' : '搜索' }}
          </button>
        </div>
        <div v-if="candidates.length" class="chips" style="margin-top: 12px">
          <ArtistChip
            v-for="a in candidates"
            :key="a.artistId"
            :artist="a"
            :busy="loadingArtistId === a.artistId"
            :taken="a.taken"
            action="加载其专辑"
            @pick="loadCustomAlbums"
          />        </div>
        <p v-if="lastAdded" class="addedtip">✓ {{ lastAdded }}</p>
        <p class="hint">点「加载其专辑」把某位歌手的专辑放进来，再点封面勾选；一局至少 4 张、<b>最多 100 张</b>。</p>
        <p class="hint warnline">
          注意：跨歌手混战会优先把不同歌手配到一起，但同一歌手的专辑仍可能在某一轮相遇（同室操戈），这属正常赛制。
        </p>

        <!-- 勾选工具条：随时能看到选了几张，"卡住"也有一键清空这个出口 -->
        <div v-if="customPool.length" class="pickbar">
          <span>
            已选 <b>{{ customPick.length }}</b> / {{ MAX_CUSTOM }} 张 · 池里共 {{ customPool.length }} 张
          </span>
          <button class="mini" type="button" :disabled="!customPick.length" @click="clearCustomPick">
            清空选择
          </button>
          <button
            class="mini"
            type="button"
            :disabled="customPick.length >= MAX_CUSTOM"
            @click="selectAllCustom"
          >
            全选池里 {{ customPool.length }} 张
          </button>
        </div>

        <div v-if="customPool.length" class="pool pickpool">
          <button
            v-for="al in customPool"
            :key="al.albumId"
            class="pk"
            :class="{ off: !isPicked(al.albumId) }"
            type="button"
            @click="toggleCustom(al.albumId)"
          >
            <div class="art">
              <img :src="al.artworkUrl" :alt="al.name" loading="lazy" />
              <span class="ck"><svg viewBox="0 0 24 24"><path d="M9 16.2L4.8 12l-1.4 1.4L9 19 21 7l-1.4-1.4z" /></svg></span>
            </div>
            <b>{{ al.name }}</b><span>{{ al._artistName }} · {{ year(al.releaseDate) }}</span>
          </button>
        </div>
      </div>
    </template>

    <!-- 需要选歌手的模式 -->
    <template v-else>
      <div v-if="needsArtists" class="block">
        <h4>
          参赛歌手
          <em>{{ artistHint }}</em>
        </h4>
        <div class="searchrow">
          <input
            v-model="term"
            class="ipt"
            placeholder="输入歌手名，如 周杰伦 / 陶喆"
            @keyup.enter="doSearch"
          />
          <button class="btn pri sm" type="button" :disabled="searching" @click="doSearch">
            {{ searching ? '搜索中…' : '搜索' }}
          </button>
        </div>

        <div v-if="candidates.length" class="chips" style="margin-top: 12px">
          <ArtistChip
            v-for="a in candidates"
            :key="a.artistId"
            :artist="a"
            :on="picked.some((x) => x.artistId === a.artistId)"
            :taken="a.taken"
            action="加入"
            @pick="addArtist"
          />
        </div>

        <!-- 已选歌手：单独一排（与搜索结果分开），避免误点重复加入 -->
        <div v-if="picked.length" class="pickedrow">
          <span class="pickedlab">已选 {{ picked.length }} 位</span>
          <span v-for="a in picked" :key="a.artistId" class="chip on">
            <b>{{ a.name }}</b>
            <i v-if="cupMode">{{ scaleLabel }}</i>
            <span class="x" @click="removeArtist(a.artistId)">×</span>
          </span>
        </div>

        <div class="combopanel">
          <h4>
            常用组合 / 我收藏的组合
            <em>金色框是我的 · 左边细色条＝赛制（蓝＝混战、青＝对位）</em>
          </h4>
          <div class="presets">
            <span
              v-for="c in shownCombos"
              :key="c.comboId || c.label"
              class="combowrap"
              :class="{ mine: c.mine }"
            >
              <button
                class="preset"
                :class="{ 'sc-aligned': c.scopeType === 'aligned' }"
                type="button"
                :disabled="presetLoading === c.label"
                @click="applyCombo(c)"
              >
                <span class="minetag" :class="{ al: c.scopeType === 'aligned' }">{{
                  c.scopeType === 'aligned' ? '对位' : '混战'
                }}</span>
                {{ presetLoading === c.label ? '装填中…' : c.label }}
              </button>
              <span v-if="c.mine" class="combox" title="删除这个组合" @click.stop="removeCombo(c)">×</span>
            </span>
            <button
              class="preset addcombo"
              type="button"
              :disabled="savingCombo || picked.length < 2"
              :title="picked.length < 2 ? '先选 2 位以上歌手' : '把当前歌手存成我的组合'"
              @click="saveCombo"
            >
              {{ savingCombo ? '保存中…' : '＋ 收藏当前组合' }}
            </button>
          </div>
        </div>
        <p class="hint">或快速搜单个歌手：</p>
        <div class="presets">
          <button v-for="n in QUICK" :key="n" class="preset" type="button" @click="quickSearch(n)">
            {{ n }}
          </button>
        </div>
      </div>

      <!-- v2 参赛规模 + 抽张方式（杯赛制才有）
           ⚠️ 2026-09-23 第十二批：流派/年代模式**不再显示**这一块 ——
           该模式自己有一块「参赛张数」（GENRE_ERA_PRESETS：16/24/32/48，走 genreEraScale），
           而这块的档位（SINGER_SCALES/PER_ARTIST_SCALES）在流派模式下**根本不参与建局**
           （buildPayload 里 genre-era 发的是 genreEraScale）→ 留着就是"改了没用的假控件"。
           口径：有独立的参赛张数块的模式，就不显示这块。 -->
      <div v-if="cupMode && mode !== 'genre-era'" class="block">
        <h4>
          参赛规模
          <em>{{ mode === 'artist' ? '这位歌手有几张能进池' : '每位歌手有几张能进池' }}</em>
        </h4>
        <div class="seg" style="margin-bottom: 14px">
          <button
            v-for="s in scaleOptions"
            :key="s"
            type="button"
            :class="{ on: currentScale === s }"
            @click="setScale(s)"
          >
            {{ s }} 张
          </button>
        </div>

        <!-- 合格专辑不够所选张数时必须说清楚：只影响这一位，别人不受影响 -->
        <p v-if="scaleShortfall.length" class="hint warnline">
          <template v-for="(s, i) in scaleShortfall" :key="s.name">
            <br v-if="i" />《{{ s.name }}》只有 <b>{{ s.have }}</b> 张合格专辑，
            {{ s.have ? `将按 ${s.have} 张出战` : '没有可参赛的合格专辑（这局先别带 TA）' }}
          </template>
          —— 只影响这几位，其他歌手不受影响。
        </p>

        <h4>
          这几张怎么选
          <em>不指定就随机抽 —— 保留开盲盒的刺激感</em>
        </h4>
        <div class="seg" style="margin-bottom: 12px">
          <button type="button" :class="{ on: pickStrategy === 'random' }" @click="pickStrategy = 'random'">
            随机抽 {{ currentScale }} 张
          </button>
          <button type="button" :class="{ on: pickStrategy === 'newest' }" @click="pickStrategy = 'newest'">
            最新 {{ currentScale }} 张
          </button>
          <button type="button" :class="{ on: pickStrategy === 'picked' }" @click="pickStrategy = 'picked'">
            自己挑
          </button>
        </div>

        <!-- 自己挑：列出已选歌手的合格专辑，勾选即入池 -->
        <template v-if="pickStrategy === 'picked'">
          <p class="hint">
            点封面勾选要参赛的专辑（<b>已选 {{ selfPicked.length }} 张</b>，至少 4 张；再点一次可取消）。
          </p>
          <div v-if="selfPickPool.length" class="pool pickpool">
            <button
              v-for="al in selfPickPool"
              :key="al.albumId"
              class="pk"
              type="button"
              :class="{ off: !selfPicked.map(Number).includes(Number(al.albumId)) }"
              @click="toggleSelfPick(al.albumId)"
            >
              <div class="art">
                <img :src="al.artworkUrl" :alt="al.name" loading="lazy" />
                <span class="ck"><svg viewBox="0 0 24 24"><path d="M9 16.2L4.8 12l-1.4 1.4L9 19 21 7l-1.4-1.4z" /></svg></span>
              </div>
              <b>{{ al.name }}</b>
              <span>{{ al._artistName }} · {{ year(al.releaseDate) }}</span>
            </button>
          </div>
          <p v-else class="hint">先选歌手，才能列出可挑的专辑。</p>
        </template>

        <p class="hint" v-if="plan">
          赛程：<b>{{ describePlan(plan) }}</b>。规模越大越热闹（多歌手混战最多 100 张，单歌手档位最大 32 张）。
        </p>
        <p class="hint" v-else>先选歌手，才能算出赛程。</p>
      </div>

      <!-- 按流派 / 年代 子选择 -->
      <div v-if="mode === 'genre-era'" class="block">
        <h4>范围 <em>二选一</em></h4>
        <div class="seg" style="margin-bottom: 14px">
          <button type="button" :class="{ on: genreOrEra === 'genre' }" @click="genreOrEra = 'genre'">
            按流派
          </button>
          <button type="button" :class="{ on: genreOrEra === 'era' }" @click="genreOrEra = 'era'">
            按年代
          </button>
        </div>
        <div v-if="genreOrEra === 'genre'" class="genrewrap">
          <!-- 流派选项 = 曲库里真实存在的流派（带歌手数），不是写死的英文表 —— hk 区是「國語流行樂」这类繁体标签 -->
          <div v-if="genreOptions.length" class="chips">
            <button
              v-for="g in genreOptions"
              :key="g.genre"
              type="button"
              class="chip"
              :class="{ on: genre === g.genre }"
              @click="genre = g.genre"
            >
              {{ g.genre }}<i>{{ g.curated ? '策展名单' : `${g.artists} 位歌手` }}</i>
            </button>
          </div>
          <p v-else class="hint">
            曲库里还没有带流派标签的歌手 —— 先在上方搜索并缓存几位歌手，回来这里就能按流派开局。
          </p>
          <div class="searchrow" style="margin-top: 10px">
            <input v-model="genre" class="ipt" placeholder="或直接输入流派词（需与曲库标签一致，如 流行樂）" />
          </div>
          <p class="hint">
            流派 = 曲库里已缓存歌手的 iTunes 流派标签；命中后自动按准入规则过滤，再<b>各歌手轮转抽你选的张数（最多 48 张）</b>入池 —— 不用手动挑，专辑多也不怕。
          </p>

          <!-- ⭐ 这册内置歌手 · 2026-09-24 第十三批（用户重新梳理的需求）
               ────────────────────────────────────────────────────────────
               用户原话："把你白名单那 19 个流派作为我们默认的流派 里面的歌手就按你名单里的那些
               一个不要动不要变 …白名单里的全部给我入库内置 你现在这个白名单展开根本不需要，
               按我说的内置好了 用户点开每一个流派就能看到内置的白名单上的这些歌手 并且也已经全部入库。"
               所以**去掉"点开即见"按钮**：选中流派就自动取一次（本地毫秒级、不打 iTunes），
               直接把这一册内置歌手平铺出来。全部已入库时不再提示"还缺谁"。 -->
          <div class="grow">
            <div class="growhd">
              <b>这册内置歌手</b>
              <span>
                <template v-if="wlData">
                  共 <b>{{ wlData.total }}</b> 位 ·
                  <b>{{ wlData.cached === wlData.total ? '已全部内置入库' : `已入库 ${wlData.cached} 位` }}</b>
                </template>
                <template v-else>选中流派后自动列出这一册的歌手</template>
              </span>
            </div>
            <p v-if="wlData && wlData.total && wlData.cached === wlData.total" class="hint">
              下面这些就是「{{ genre }}」这一册的<b>全部内置歌手</b>，已经在曲库里 ——
              开局直接从他们名下抽专辑，不用再手动补。
            </p>
            <p v-if="wlData && wlData.total && wlData.cached < wlData.total" class="hint warnline">
              这一册还差 {{ wlData.total - wlData.cached }} 位没入库，可用下方「一键补知名歌手」补齐。
            </p>
            <p v-if="wlLoading" class="hint">读取中…</p>
            <div v-if="wlData && wlData.total" class="glist wllist">
              <span
                v-for="a in wlData.artists"
                :key="a.name"
                class="chip"
                :class="{ lock: a.cached }"
                :title="a.cached ? `已在曲库（${a.localAlbumCount} 张）` : '未入库'"
              >
                <b>{{ a.name }}</b>
                <i>{{ a.cached ? `已入库 ${a.localAlbumCount} 张` : '未入库' }}</i>
              </span>
            </div>
            <p v-else-if="!wlLoading && mode === 'genre-era' && genreOrEra === 'genre'" class="hint">
              这个流派没有人工白名单册（后端会走 Apple 榜单 + 关键词兜底）。
            </p>
          </div>

          <!-- 流派歌手扩充（2026-09-24 第十六批改造）
               用户："这里的补充功能从音乐源找这个功能你怎么没了 然后既然上面能点开看到
               下面就没必要再做了 而且你没有做点开后收起来"。
               → ① 名字改回「从音乐源找歌手」：在线补**非白名单**歌手（来源＝Apple 榜单/关键词，
                  白名单那册在上面已经列过了，这里不再算它的账）；
                 ② 列表**只列还没入库的**（上面「这册内置歌手」已把已入库的列过，不重复）；
                 ③ 按钮＝开关：点开查找、再点收起。 -->
          <div class="grow">
            <div class="growhd">
              <b>流派歌手不够？从音乐源补</b>
              <span>
                被选中的流派：<b>{{ genre || '（还没选）' }}</b>
                <template v-if="genreCount"> · 曲库里现有 <b>{{ genreCount }}</b> 位歌手</template>
              </span>
            </div>
            <div class="growrow">
              <button
                class="btn ghost sm"
                type="button"
                :disabled="!genre.trim() || growing || discovering"
                @click="toggleDiscover"
              >
                {{ discovering ? '正在查找…' : discoverOpen ? '收起' : '从音乐源找歌手' }}
              </button>
              <template v-if="discoverOpen && missing.length">
                <button
                  class="btn ghost sm"
                  type="button"
                  :disabled="growing"
                  @click="toggleAllWarm"
                >
                  {{ warmPick.length === missing.length ? '取消全选' : `全选未入库（${missing.length}）` }}
                </button>
                <button
                  class="btn pri sm"
                  type="button"
                  :disabled="growing || !warmPick.length"
                  @click="warmSelected"
                >
                  {{ growing ? `入库中 ${warmDone}/${warmPick.length}…` : `入库已选 ${warmPick.length} 位` }}
                </button>
              </template>
            </div>

            <template v-if="discoverOpen">
              <p v-if="discoverNote" class="hint">{{ discoverNote }}</p>
              <p v-if="missing.length" class="hint pickhint">
                这里只列<b>还没入库</b>的歌手（已在库里的，上面「这册内置歌手」列过了，不再重复）——
                <b>点名字即可勾选</b>补进曲库。
              </p>

              <div v-if="missing.length" class="glist">
                <span
                  v-for="a in missing"
                  :key="a.artistId"
                  class="chip"
                  :class="{ sel: warmPick.includes(a.artistId) }"
                  title="点击勾选／取消"
                  role="button"
                  tabindex="0"
                  @click="toggleWarm(a.artistId, false)"
                >
                  <b>{{ a.name }}</b>
                  <i>{{ a.genre || genre.trim() }}</i>
                </span>
              </div>
              <p v-else-if="discovered.length" class="hint">
                这一册的歌手都已经入库了，不用补 —— 直接选张数开局就行。
              </p>
            </template>
          </div>
        </div>
        <div v-else class="yearrow">
          <input v-model.number="yearStart" class="ipt year" type="number" min="1900" max="2100" />
          <span class="dash">—</span>
          <input v-model.number="yearEnd" class="ipt year" type="number" min="1900" max="2100" />
          <span class="hint" style="margin: 0">年（含首尾）</span>
        </div>
        <!-- 年代专辑池补足（#84）：区间内本地专辑不够时，从 Apple Music 把已知歌手整张碟同步进来撑大池子 -->
        <div v-if="genreOrEra === 'era'" class="grow">
          <div class="growhd">
            <b>年代专辑不够？从 Apple Music 补足</b>
            <span>区间 {{ yearStart || '—' }} — {{ yearEnd || '—' }} 年</span>
          </div>
          <div class="growrow">
            <button
              class="btn pri sm"
              type="button"
              :disabled="eraBackfilling"
              @click="backfillEra"
            >
              {{ eraBackfilling ? '正在补足…' : '补足该年代' }}
            </button>
          </div>
          <p v-if="eraBackfillNote" class="hint">{{ eraBackfillNote }}</p>
        </div>
        <!-- 参赛张数：让用户真正能决定"选几张参战"（2026-09-23 修复：之前前端从不发 albumCount，
             后端恒按 32 封顶，选择无效）。后端会按此张数各歌手轮转抽，命中歌手越多越能凑跨歌手对阵。
             2026-09-23 第十二批：档位改 16/24/32/48，上限 48（后端 ERA_MAX_POOL 同步）。 -->
        <div class="block">
          <h4>参赛张数 <em>决定赛程规模</em></h4>
          <div class="seg" style="margin-top: 8px">
            <button
              v-for="n in GENRE_ERA_PRESETS"
              :key="n"
              type="button"
              :class="{ on: genreEraScale === n }"
              @click="genreEraScale = n"
            >
              {{ n }} 张
            </button>
          </div>
          <p class="hint" style="margin-top: 8px">
            最多 <b>48 张</b>（档位 16 / 24 / 32 / 48）。命中歌手越多，越能凑出跨歌手对阵。
          </p>
        </div>
        <!-- 地区/语种筛选（2026-09-23 用户拍板）：
             两级 —— 华语区 / 外语区，选定后再细分语种；都不勾＝混着打（与改动前行为一致）。
             起因：用户报年代模式"粤语专辑好多"，因为年代区间横跨所有地区、本地港台歌手本来就多。 -->
        <div class="block">
          <h4>地区 / 语种 <em>不勾＝混着打</em></h4>
          <div class="seg" style="margin-top: 8px">
            <button type="button" :class="{ on: zoneFilter === '' }" @click="setZone('')">不限</button>
            <button type="button" :class="{ on: zoneFilter === 'zh' }" @click="setZone('zh')">华语区</button>
            <button type="button" :class="{ on: zoneFilter === 'foreign' }" @click="setZone('foreign')">外语区</button>
          </div>
          <div v-if="zoneFilter" class="seg" style="margin-top: 8px">
            <button type="button" :class="{ on: langFilter === '' }" @click="langFilter = ''">全部语种</button>
            <button
              v-for="l in langOptions"
              :key="l.value"
              type="button"
              :class="{ on: langFilter === l.value }"
              @click="langFilter = l.value"
            >
              {{ l.label }}
            </button>
          </div>
          <p class="hint">
            选「华语区」但不选具体语种时，池子会按语种<b>交替均衡</b> —— 不会一边倒向粤语。
          </p>
        </div>
        <p class="hint">命中的合格专辑会各歌手轮转抽，最多取你选的张数；流派 / 年代歌手越多，越能凑出跨歌手对阵（先点上方"一键补知名歌手"把该流派的大牌加进曲库）。</p>
      </div>

      <!-- 对位赛参数 -->
      <div v-if="mode === 'aligned'" class="block">
        <h4>对位张数与配对方式</h4>
        <div class="yearrow">
          <!-- 2026-09-20 用户："对位赛的歌手专辑选择数量最大值拉到 24"（原来 10 太少）。
               准入过滤之后基本不会有歌手超过 24 张，所以 24 是安全上限。 -->
          <input v-model.number="alignCount" class="ipt year" type="number" min="1" max="24" />
          <span class="hint" style="margin: 0">张/位（1–24）</span>
        </div>
        <div class="seg" style="margin-top: 10px; margin-bottom: 0">
          <button
            v-for="n in ALIGN_PRESETS"
            :key="n"
            type="button"
            :class="{ on: alignCount === n }"
            @click="alignCount = n"
          >
            {{ n }} 张
          </button>
        </div>
        <div class="seg" style="margin-top: 12px; margin-bottom: 0">
          <button type="button" :class="{ on: alignMode === 'ordinal' }" @click="alignMode = 'ordinal'">
            同序号（第 k 张对第 k 张）
          </button>
          <button type="button" :class="{ on: alignMode === 'chrono' }" @click="alignMode = 'chrono'">
            年代就近
          </button>
        </div>
        <p class="hint">
          总场次 = C(歌手数, 2) × 对位张数，当前为 <b>{{ alignedTotal }}</b> 场。对位赛不产生冠军，出的是逐张对照表。
        </p>
        <p v-if="alignedInsufficient" class="hint warnline">
          有歌手没有可用的正式专辑，对位赛组不出来 —— 请去掉 TA 或换一位（每位歌手至少要 1 张合格专辑）。
        </p>
      </div>

      <!-- 参赛池预览（规模模式：勾选态由档位决定） -->
      <div v-if="poolPreview.length" class="block">
        <h4>
          参赛池 · 先亮出几张
          <em v-if="poolStats">
            共检索 {{ poolStats.total }} 张 · 剔除 {{ poolStats.excluded }} 张 · 本轮出战 {{ totalSelected }} 张
          </em>
        </h4>

        <div class="tipbar">
          <svg viewBox="0 0 24 24">
            <path d="M12 2a10 10 0 100 20 10 10 0 000-20zm-1 5h2v2h-2V7zm0 4h2v6h-2v-6z" />
          </svg>
          <span>
            已按准入规则自动过滤：<b>单曲 / 现场与演唱会 / 影视原声 / 精选与复刻</b> 不计入正式专辑。
            <b>本轮共 {{ totalSelected }} 张出战，这里只先亮出 {{ poolPreview.length }} 张</b><template v-if="hiddenCount">，其余 {{ hiddenCount }} 张留到对决时逐张揭晓</template>
            —— 留着开盲盒的悬念。</span>
        </div>

        <div v-if="excludedList.length" class="excluded">
          <p class="hint">被剔除的专辑（每张标注命中规则）：</p>
          <ul>
            <li v-for="e in excludedList.slice(0, 10)" :key="e.albumId">
              {{ e.name }} <span class="tag">{{ e.reason }}</span>
            </li>
          </ul>
        </div>

        <div class="pool">
          <div v-for="al in poolPreview" :key="al.albumId" class="pk" :class="{ off: !al._in }">
            <div class="art">
              <img :src="al.artworkUrl" :alt="al.name" loading="lazy" />
              <span class="ck"><svg viewBox="0 0 24 24"><path d="M9 16.2L4.8 12l-1.4 1.4L9 19 21 7l-1.4-1.4z" /></svg></span>
            </div>
            <b>{{ al.name }}</b>
            <span>{{ al._artistName || artistName }} · {{ year(al.releaseDate) }}</span>
          </div>
          <!-- 盲盒虚位卡：模糊堆叠 + 省略号 + 计数，明示"这不是全部"，保留开盲盒的悬念 -->
          <div v-if="hiddenCount" class="pk more" aria-hidden="true">
            <div class="art">
              <span class="stack s1"></span>
              <span class="stack s2"></span>
              <span class="dots3">···</span>
            </div>
            <b>还有 {{ hiddenCount }} 张</b>
            <span>盲盒 · 进对决才揭晓</span>
          </div>
        </div>
      </div>
    </template>

    <!-- 开始条 -->
    <div class="startbar">
      <span class="info" v-if="startInfo">{{ startInfo }}</span>
      <span class="info" v-else>先完成上面的选择，这里会显示规模与赛程</span>
      <button class="btn pri sp" type="button" :disabled="creating || !canStart" @click="onCreate">
        <svg class="ico" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z" /></svg>
        {{ creating ? '创建中…' : '开始对决' }}
      </button>
    </div>
    </div>
  </div>
</template>

<script setup>
import { computed, onMounted, ref, watch } from 'vue';
import { useRouter } from 'vue-router';
import { ElMessage, ElMessageBox } from 'element-plus';
import { musicApi, battleApi, comboApi } from '@/api';
import ArtistChip from '@/components/ArtistChip.vue';
import ResumeBar from '@/components/ResumeBar.vue';
import {
  SINGER_SCALES,
  PER_ARTIST_SCALES,
  DEFAULT_SINGER_SCALE,
  DEFAULT_PER_ARTIST,
  planTournament,
  describePlan,
} from '@/utils/tournament.js';

/**
 * 多歌手混战的总池上限：与「自选专辑最多 100 张」同口径。
 * ⚠️ 2026-09-19 用户点名：曾被错改成 32，把他"5 位歌手×10 张、40 多场"的玩法砍没了。
 *    单歌手档位（最大 32）与流派/年代（32）维持不变，只有多歌手混战是 100。
 */
const MULTI_POOL_MAX = 100;

/**
 * 模式大厅（2026-09-19 用户定稿）
 * ------------------------------------------------------------
 * 用户原话：指定对决是对位赛的衍生玩法，别和"手动挑选"搞混；
 * 所以分成**两大模式** ——
 *   · 混战模式（默认首选）：多歌手混战 / 单歌手内战 / 按流派·年代 / 手动挑选，都是杯赛制、产生冠军；
 *   · 对位模式：经典对位赛（序号对序号）/ 指定对决，都是两两一组、不淘汰出对照表。
 * ⚠️ 这里只重排 UI：底层的 `mode` 值与全部现有逻辑（投票 / 赛程 / 结果）保持不变。
 */
const LOBBY = [
  {
    key: 'battle',
    icon: 'VS',
    name: '混战模式',
    tag: '默认首选',
    intro: '不同歌手的专辑放进同一个池子里随机厮杀，逐轮淘汰，最后决出冠军。',
    modes: [
      { value: 'multi-artist', label: '多歌手混战', badge: '首选', desc: '几位歌手的专辑放一起比' },
      { value: 'artist', label: '单歌手内战', desc: '某位歌手的专辑互相比' },
      { value: 'genre-era', label: '按流派 / 年代', desc: '如华语流行 · 2000 年代' },
      { value: 'custom', label: '手动挑选', desc: '自己勾专辑入池' },
    ],
  },
  {
    key: 'aligned',
    icon: '1v1',
    name: '对位模式',
    tag: '两两一组',
    intro: '按规则两两配对、一一对应地打，回答"同阶段作品谁更强"；不淘汰，出对照表。',
    modes: [
      {
        value: 'aligned',
        label: '经典对位赛',
        badge: '序号对序号',
        desc: '第 1 张打第 1 张，第 2 张打第 2 张',
      },
      { value: 'duel', label: '指定对决', badge: '自定义', desc: '自己指定谁打谁，可跨歌手' },
    ],
  },
];

/** 扁平注册表：currentMode / cupMode 仍从这取（cup = 杯赛制，会产生冠军） */
const MODES = LOBBY.flatMap((g) => g.modes.map((m) => ({ ...m, cup: g.key === 'battle' })));

/** 当前选中的模式属于哪一族（用来高亮对应的大厅板块） */
function lobbyKeyOf(v) {
  return LOBBY.find((g) => g.modes.some((m) => m.value === v))?.key || 'battle';
}

const QUICK = ['周杰伦', '林俊杰', '陈奕迅', '陶喆'];

/** 流派选项：来自曲库的真实流派（带歌手数）；拉不到就只留手输框 */
const genreOptions = ref([]);

/**
 * 策展流派（2026-09-23 用户："流派里加上你已经做出来的华语新人，单开一个新生代"）。
 * ------------------------------------------------------------
 * ⚠️ 华语新生代 / 华语乐队**不是 Apple 的流派标签** —— 库里不会有歌手带这个标签，
 *    所以它们永远不可能从 `listGenres()`（按 Artist.genre 聚合）里冒出来。
 *    做法：前端固定挂这两个入口；后端遇到它们时走"按白名单名字匹配已缓存歌手"
 *    （battle.service 的 curatedListOf 分支），而不是 genre 正则。
 * 歌手数不硬编：策展流派不显示"N 位歌手"，只显示「策展名单」——
 * 数字由白名单定义，编在前端就是第二个真相源，迟早对不上。
 */
/**
 * 流派列表现在由**后端**按白名单规范键聚合好（2026-09-23）：
 *   · 一个白名单册 = 一个 chip（Hip-Hop/Rap 与 Hip-Hop、饒舌 这些别名写法已合并，不再重复）；
 *   · 只保留**白名单覆盖到**的流派（用户："不需要这么多流派，保留白名单里的这些就行了"）；
 *   · 策展流派（華語新生代 / 華語樂隊）固定排最前。
 * 前端不再自己拼、也不再去重 —— 两边都改就是第二个真相源，迟早对不上。
 */
function normalizeGenreList(list) {
  return (list || []).filter((g) => g && g.genre);
}

// —— 流派歌手扩充（Apple Music 抓同流派的歌手补进曲库）——
const discovering = ref(false);
/** ③ 列表开关（2026-09-24 第十六批：用户"你没有做点开后收起来"）—— 点开查找、再点收起 */
const discoverOpen = ref(false);

function toggleDiscover() {
  discoverOpen.value = !discoverOpen.value;
  // 第一次点开才去查（查过的结果保留，收起再打开不重复请求）
  if (discoverOpen.value && !discovered.value.length) discoverGenre();
}
const growing = ref(false);
const discovered = ref([]);
const discoverNote = ref('');
const warmDone = ref(0);
/** 这个流派在曲库里现存的歌手数（策展流派返回 null —— 它的歌手集合由白名单定义，不是 genre 聚合出来的） */
const genreCount = computed(() => {
  const hit = genreOptions.value.find((g) => g.genre === genre.value);
  return hit?.curated ? null : hit?.artists || 0;
});
/** 还没入库的那些（只补这些，已入库的不重复拉） */
const missing = computed(() => discovered.value.filter((a) => !a.cached));
/**
 * 用户逐个点选出来"要入库"的歌手（2026-09-18 用户要求「增加点选可以入库」）。
 * 以前只有一个"把前 N 位补进曲库"的全量按钮 —— 榜上混着不想收的人也没法挑。
 */
const warmPick = ref([]);

/**
 * ⭐ 「这册内置歌手」自动取数 · 2026-09-24 第十三批
 * 用户重新梳理的需求：白名单那 19 册就是默认流派，册里的歌手**全部内置入库**；
 *   "你现在这个白名单展开根本不需要 … 用户点开每一个流派就能看到内置的白名单上的这些歌手"。
 * → 去掉按钮，选中流派就自动取一次（`/music/genres/whitelist` 只读本地库，毫秒级、不打 iTunes）。
 * ⚠️ `watch` 必须放在 `genre`/`genreOrEra` 声明**之后**（放前面命中暂时性死区 → 整页白屏，
 *    2026-09-23 被 verify-r25 的"零 JS 运行时错误"断言抓到过）。
 */
const wlLoading = ref(false);
const wlData = ref(null);

async function loadWhitelistRoster(term) {
  const g = String(term || '').trim();
  if (!g) {
    wlData.value = null;
    return;
  }
  wlLoading.value = true;
  try {
    wlData.value = (await musicApi.genreWhitelist({ genre: g })) || null;
  } catch {
    wlData.value = null; // 取不到就不显示这一块，不弹错（这里是辅助信息）
  } finally {
    wlLoading.value = false;
  }
}

onMounted(async () => {
  try {
    const data = await musicApi.listGenres();
    genreOptions.value = normalizeGenreList(data.list);
  } catch {
    /* 忽略：流派选项拉不到不影响手输 */
  }
  loadCombos();
});

/** 点选 / 取消一位歌手（已在库的不可选） */
function toggleWarm(artistId, cached) {
  if (cached || growing.value) return;
  warmPick.value = warmPick.value.includes(artistId)
    ? warmPick.value.filter((x) => x !== artistId)
    : [...warmPick.value, artistId];
}

/** 全选 / 取消全选未入库的那些 */
function toggleAllWarm() {
  if (growing.value) return;
  warmPick.value =
    warmPick.value.length === missing.value.length ? [] : missing.value.map((a) => a.artistId);
}

/** ① 看看这个流派在 Apple Music 里靠前的是哪些歌手 */
async function discoverGenre() {
  if (!genre.value.trim()) return;
  discovering.value = true;
  discovered.value = [];
  warmPick.value = [];
  discoverNote.value = '';
  try {
    // online=true：「从音乐源找歌手」要在线补白名单之外的人（2026-09-24 第十七批）
    const d = await musicApi.discoverGenreArtists({ genre: genre.value.trim(), limit: 30, online: true });
    discovered.value = d?.artists || [];
    if (!discovered.value.length) {
      discoverNote.value = '这个流派没找到歌手，换个流派词试试（如 Mandopop / Rock / 爵士）';
      return;
    }
    const name = genre.value.trim();
    /**
     * ⚠️ 2026-09-23 用户定调："把白名单做成默认，时下热门的做成去补的那些人"。
     * 所以来源说明也要跟着改 —— 现在主来源是**人工白名单**（大众认知里这个流派该有谁），
     * Apple 榜单只在白名单凑不满 30 位时补足。
     */
    const srcNote =
      d?.source === 'whitelist'
        ? '（全部来自人工白名单 · 按大众对这个流派的认知挑选）'
        : d?.source === 'chart'
          ? '（来自 Apple Music 该流派榜单 —— 白名单没覆盖到的部分）'
          : d?.source === 'mixed'
            ? '（人工白名单为主 + Apple 榜单补足）'
            : '（关键词检索）';
    discoverNote.value = d?.loose
      ? `「${name}」在白名单与 Apple 都没有统一流派标签，这 ${discovered.value.length} 位是按相关度收的 —— 勾选前你可以先看一眼名字对不对`
      : `「${name}」的 ${discovered.value.length} 位知名歌手${srcNote}，其中 ${discovered.value.length - missing.value.length} 位已在曲库`;
  } catch (e) {
    discoverNote.value = e?.message || '查找失败';
  } finally {
    discovering.value = false;
  }
}

/** ② 分批入库（后端每批最多 8 位 —— 每位都要打一次 Apple 的专辑接口） */
async function warmSelected() {
  const ids = warmPick.value.slice();
  if (!ids.length) return;
  growing.value = true;
  warmDone.value = 0;
  const CHUNK = 6;
  let saved = 0;
  try {
    for (let i = 0; i < ids.length; i += CHUNK) {
      // eslint-disable-next-line no-await-in-loop
      const r = await musicApi.warmGenreArtists({
        genre: genre.value.trim(),
        artistIds: ids.slice(i, i + CHUNK),
      });
      saved += r?.saved || 0;
      warmDone.value = Math.min(i + CHUNK, ids.length);
      // 入库完立刻刷新"已入库"标记，用户能看到一个个变绿
      // eslint-disable-next-line no-await-in-loop
      const done = new Set((r?.results || []).filter((x) => x.ok).map((x) => x.artistId));
      discovered.value = discovered.value.map((a) =>
        done.has(a.artistId) ? { ...a, cached: true, localAlbumCount: a.localAlbumCount } : a,
      );
      warmPick.value = warmPick.value.filter((x) => !done.has(x));
    }
    ElMessage.success(`已把 ${saved} 位歌手补进曲库，现在可以按「${genre.value.trim()}」开局了`);
    // 刷新流派列表，让歌手数显示同步更新
    const g = await musicApi.listGenres();
    genreOptions.value = normalizeGenreList(g.list);
  } catch (e) {
    ElMessage.error(e?.message || '入库失败');
  } finally {
    growing.value = false;
  }
}

/**
 * #84 年代专辑池补足：区间内本地专辑不够时，从 Apple Music 把已知歌手整张碟同步进来撑大池子。
 * 与流派「从 Apple Music 补足」同思路，只是种子来自"区间内已知歌手"而非流派榜单。
 */
async function backfillEra() {
  eraBackfilling.value = true;
  eraBackfillNote.value = '';
  try {
    const r = await musicApi.eraBackfill({
      startYear: yearStart.value,
      endYear: yearEnd.value,
      needCount: genreEraScale.value,
    });
    eraBackfillNote.value = `区间内合格专辑 ${r.before} → ${r.after} 张${
      r.triggered ? (r.synced > 0 ? `（已更新 ${r.synced} 位歌手）` : '（已尝试但无新增，可能网络不可达）') : '（本地已足够）'
    }`;
    if (r.after > r.before) ElMessage.success('年代专辑已补足，现在可以选更多张参战了');
  } catch (e) {
    eraBackfillNote.value = e?.message || '补足失败';
  } finally {
    eraBackfilling.value = false;
  }
}

const router = useRouter();

const mode = ref('multi-artist');
const term = ref('');
const searching = ref(false);
const creating = ref(false);
const candidates = ref([]);
const picked = ref([]);

// 规模
const singerScale = ref(DEFAULT_SINGER_SCALE);
const perArtistScale = ref(DEFAULT_PER_ARTIST);
/** 抽张方式：random=随机抽（默认，保留盲盒刺激）/ newest=最新 N 张 / picked=自己挑 */
const pickStrategy = ref('random');
/** 自己挑模式下勾选的专辑（albumId） */
const selfPicked = ref([]);

/**
 * 常用组合 / 我收藏组合
 * ------------------------------------------------------------
 * 由后端数据驱动（`/api/combos`）：**系统组合**由管理员在后台维护、所有人可见；
 * **用户自建组合**存进自己账号，只有本人看得到（"我收藏组合"）。
 * 下面这 4 个只作**后端还没有任何系统组合时的兜底**（按名字搜歌手来装填）。
 */
const FALLBACK_PRESETS = [
  { label: '周杰伦 vs 林俊杰', names: ['周杰伦', '林俊杰'], per: 8 },
  { label: '华语三强混战', names: ['周杰伦', '林俊杰', '陈奕迅'], per: 8 },
  { label: '欧美经典对决', names: ['Taylor Swift', 'Adele'], per: 8 },
  { label: '中外对决', names: ['周杰伦', 'Taylor Swift'], per: 8 },
];
const presetLoading = ref('');
/** 后端返回的组合（系统 + 我的） */
const combos = ref([]);
const savingCombo = ref(false);
/**
 * 组合按「与当前模式是否匹配」排序 + 标出赛制
 * 用户 2026-09-20：“对位赛创建的组合没有和经典模式区分开” ——
 * 以前 chip 不标赛制、也不按模式排，对位赛里混着一堆混战组合，点哪个都像碰运气。
 */
const shownCombos = computed(() => {
  const list = combos.value.length ? combos.value : FALLBACK_PRESETS;
  const want = mode.value === 'aligned' ? 'aligned' : 'multi-artist';
  return [...list].sort((a, b) => {
    const am = (a.scopeType || 'multi-artist') === want ? 0 : 1;
    const bm = (b.scopeType || 'multi-artist') === want ? 0 : 1;
    return am - bm;
  });
});

// 流派 / 年代
const genreOrEra = ref('genre');
const genre = ref('Pop');
const yearStart = ref(2000);

/**
 * 「这册内置歌手」自动取数（2026-09-24 第十三批）
 * 选中的流派变了、或切回「按流派」这一栏 → 自动取一次该册名单（只读本地库，不打 iTunes）。
 * ⚠️ 必须放在 `genre` / `genreOrEra` 声明**之后**：放前面会命中暂时性死区（ReferenceError），
 *    整页白屏（2026-09-23 被自检 verify-r25 抓到过，所以这条纪律写在注释里）。
 */
watch([genre, genreOrEra], ([g, ge]) => {
  if (ge !== 'genre') return;
  loadWhitelistRoster(g);
});
const yearEnd = ref(2020);
/**
 * 地区 / 语种两级筛选（2026-09-23 用户拍板："新增一个华语区 外语区，如果不勾选就是混在一起打"）。
 * 语义与后端 passesLanguageFilter 一致：
 *   zone 空 → 混着打（**与改动前行为完全一致**，老组合/老局面不受影响）
 *   zone='zh'  → 华语区（国语 + 粤语）；再选 lang 就只留该语种
 *   zone='foreign' → 外语区（日语 + 韩语 + 欧美）
 */
const zoneFilter = ref('');
const langFilter = ref('');
const LANG_BY_ZONE = {
  zh: [
    { value: 'mandarin', label: '国语' },
    { value: 'cantonese', label: '粤语' },
  ],
  foreign: [
    { value: 'japanese', label: '日语' },
    { value: 'korean', label: '韩语' },
    { value: 'western', label: '欧美' },
  ],
};
/** 子语种只列当前大区下的，避免出现"外语区 + 粤语"这种自相矛盾的组合 */
const langOptions = computed(() => LANG_BY_ZONE[zoneFilter.value] || []);
function setZone(z) {
  zoneFilter.value = z;
  langFilter.value = '';
}
// 年代专辑池补足（#84）：区间内本地专辑不够时，从 Apple Music 把已知歌手整张碟同步进来
const eraBackfilling = ref(false);
const eraBackfillNote = ref('');

// 对位赛
const alignCount = ref(3);
// 流派 / 年代模式的「参赛张数」预设（2026-09-23 修复"选几张参战无效"）
// 2026-09-23 第十二批：用户拍板改为 **16 / 24 / 32 / 48**（原 8/12/16/24/32）——
//   档位整体上移，并把上限从 32 抬到 48；后端 ERA_MAX_POOL 同步 32→48（赛程公式是纯函数，48 可推）。
const GENRE_ERA_PRESETS = [16, 24, 32, 48];
const genreEraScale = ref(16);
/** 对位赛常用档位（用户要求上限拉到 24：准入过滤后基本不会有歌手超过 24 张） */
const ALIGN_PRESETS = [4, 6, 8, 12, 16, 24];
const alignMode = ref('ordinal');

// 手动挑选
const customPool = ref([]);
const customPick = ref([]);

// 指定对决
const duelTerm = ref('');
const duelSearching = ref(false);
const duelCandidates = ref([]);
const duelArtistName = ref('');
const duelAlbums = ref([]);
const currentPair = ref([]);
const pairs = ref([]);
/** 已载入专辑的歌手（可多位 —— 指定对决要能跨歌手，否则只能"自己打自己"） */
const duelArtists = ref([]);

/** 当前这一步该干什么 —— 以前只有一句静态提示，选了 1 张之后就没下文了 */
const duelHint = computed(() => {
  if (!currentPair.value.length) {
    return duelArtists.value.length > 1
      ? `点两张组成一组对位（上面 ${duelArtists.value.length} 位歌手的专辑可以混搭，跨歌手更精彩）`
      : '点两张组成一组对位；想跨歌手就再搜一位歌手加入候选池';
  }
  const n = pairs.value.length + 1;
  return `已选「${currentPair.value[0].name}」——再点 1 张，组成第 ${n} 组`;
});
/** 在"待成组"里（还没凑够 2 张） */
const isPending = (al) => currentPair.value.some((x) => x.albumId === al.albumId);
/** 已经进了对阵表（用掉了，不能再选） */
const isPaired = (al) => pairs.value.some((p) => p.some((x) => x.albumId === al.albumId));

// 每位歌手的专辑池缓存：artistId -> { eligible, excluded, stats }
const artistPool = ref({});

const currentMode = computed(() => MODES.find((m) => m.value === mode.value) || MODES[0]);
const cupMode = computed(() => currentMode.value.cup);
/** 流派/年代由后端按命中专辑反推歌手，不需要（也不该）让用户挑歌手 */
const needsArtists = computed(() => ['artist', 'multi-artist', 'aligned'].includes(mode.value));
const artistHint = computed(() => {
  if (mode.value === 'artist') return '选 1 位';
  if (mode.value === 'aligned') return '2 至 4 位 · 逐张对位';
  return '2 至 6 位 · 跨歌手比较';
});
const scaleOptions = computed(() => (mode.value === 'artist' ? SINGER_SCALES : PER_ARTIST_SCALES));
const currentScale = computed(() => (mode.value === 'artist' ? singerScale.value : perArtistScale.value));
const scaleLabel = computed(() => `抽 ${currentScale.value} 张`);
const alignedTotal = computed(() => {
  const a = picked.value.length;
  return ((a * (a - 1)) / 2) * alignCount.value;
});
/** 对位赛：任一已选歌手没有可用正式专辑 → 组不出对位（后端会报"所选歌手的正式专辑不足以对位"） */
const alignedInsufficient = computed(() => {
  if (mode.value !== 'aligned' || !picked.value.length) return false;
  return picked.value.some((a) => {
    const pool = artistPool.value[a.artistId];
    return pool && (pool.eligible || []).length < 1;
  });
});

const artistName = computed(() => picked.value[0]?.name || '');

/**
 * 参赛池预览 · 盲盒原则
 * ------------------------------------------------------------
 * 不再把"本轮出战的所有专辑"摊开——那样随机比拼的刺激感就没了。
 * 每位歌手只露前 EXPOSE_PER_ARTIST 张，其余进对决时逐张揭晓。
 */
const EXPOSE_PER_ARTIST = 2;

const poolPreview = computed(() => {
  const out = [];
  const takeFor = (artist) => {
    const pool = artistPool.value[artist.artistId];
    if (!pool) return [];
    const list = pool.eligible;
    // 自己挑：把勾选的显示出来（用户本来就知道自己选了啥）
    if (pickStrategy.value === 'picked') {
      const wanted = new Set(selfPicked.value.map(Number));
      return list.filter((a) => wanted.has(Number(a.albumId)));
    }
    const count = mode.value === 'artist' ? singerScale.value : mode.value === 'aligned' ? alignCount.value : perArtistScale.value;
    const base =
      pickStrategy.value === 'newest'
        ? [...list].sort((a, b) => new Date(b.releaseDate || 0) - new Date(a.releaseDate || 0))
        : list;
    return base.slice(0, Math.min(count, list.length)).slice(0, EXPOSE_PER_ARTIST);
  };
  const artists = mode.value === 'artist' ? picked.value.slice(0, 1) : picked.value;
  for (const a of artists) {
    for (const al of takeFor(a)) out.push({ ...al, _artistName: a.name, _in: true });
  }
  return out;
});

/** 预览里没露出来的张数（其余进对决时揭晓） */
const hiddenCount = computed(() =>
  pickStrategy.value === 'picked' ? 0 : Math.max(0, totalSelected.value - poolPreview.value.length),
);

/** 「自己挑」模式下的候选池：已选歌手的全部合格专辑 */
const selfPickPool = computed(() => {
  const out = [];
  for (const a of picked.value) {
    const pool = artistPool.value[a.artistId];
    if (!pool) continue;
    for (const al of pool.eligible) out.push({ ...al, _artistName: a.name });
  }
  return out;
});

/** 剔除列表（用于说明"系统替你剔了哪些"） */
const excludedList = computed(() => {
  const out = [];
  for (const a of picked.value) {
    const pool = artistPool.value[a.artistId];
    if (pool?.excluded) out.push(...pool.excluded);
  }
  return out;
});

const poolStats = computed(() => {
  let total = 0;
  let excluded = 0;
  let valid = 0;
  for (const a of picked.value) {
    const s = artistPool.value[a.artistId]?.stats;
    if (!s) continue;
    total += s.total || 0;
    excluded += s.excluded || 0;
    valid += s.valid || 0;
  }
  return total ? { total, excluded, valid } : null;
});

/** 实际参赛张数（规模模式：取每档位内可用的张数） */
const totalSelected = computed(() => {
  // 自己挑：就以勾选数为准
  if (pickStrategy.value === 'picked') return selfPicked.value.length;
  if (mode.value === 'artist') {
    const one = picked.value[0];
    const pool = one && artistPool.value[one.artistId];
    if (!pool) return 0;
    return Math.min(singerScale.value, pool.eligible.length);
  }
  if (mode.value === 'multi-artist') {
    // ⚠️ 不能因为"只选了 1 位歌手"就返回 0 —— 否则参赛池既不显示张数、也不出现盲盒虚位卡。
    //    "≥2 位才允许开局"的门槛在 canStart 里单独管，不要混进"预览计数"（2026-09-18 再修）。
    if (!picked.value.length) return 0;
    // 2026-09-19 严重 bug 修复：以前"取所有歌手的最小值 × 人数" —— 只要有一位歌手只有
    // 1 张合格专辑，其他歌手的池子也被拖到 1 张 → 5 位歌手只出 5 张、5 场就打完了。
    // 现在：各歌手按所选张数抽，**合格专辑不够就出几张**，总数 = 各歌手出战数之和。
    // 上限 100（与「自选专辑最多 100 张」同口径）—— **不是 32**：
    // 5 位 × 10 张 = 50 张、40 多场的大场是用户一直在玩的玩法，修 bug 不许顺手改玩法。
    let sum = 0;
    for (const a of picked.value) {
      const pool = artistPool.value[a.artistId];
      if (!pool) return 0;
      sum += Math.min(perArtistScale.value, pool.eligible.length);
    }
    return Math.min(sum, MULTI_POOL_MAX);
  }
  if (mode.value === 'custom') return customPick.value.length;
  // 对位赛：每位歌手取前 alignCount 张 → 总出战数 = 歌手数 × 对位张数
  // （以前这里漏了 aligned，直接 return 0，导致对位赛显示「本轮出战 0 张」且盲盒虚位卡不出现）
  if (mode.value === 'aligned') return picked.value.length * alignCount.value;
  return 0;
});

const plan = computed(() => {
  if (!cupMode.value) return null;
  if (totalSelected.value < 2) return null;
  return planTournament(totalSelected.value);
});

/**
 * 哪些歌手"合格专辑不够所选张数"。
 * 2026-09-19 修复后：某位歌手不够张数**只影响他自己**（出几张算几张），不再拖累别人 ——
 * 但必须把话说清楚，否则用户会以为"改了张数怎么赛程没变"（图4/图5 那个严重 bug 的观感）。
 */
const scaleShortfall = computed(() => {
  if (mode.value !== 'multi-artist') return [];
  return picked.value
    .map((a) => {
      const pool = artistPool.value[a.artistId];
      const have = pool?.eligible.length ?? 0;
      return { name: a.name, have, want: perArtistScale.value };
    })
    .filter((x) => x.have < x.want);
});

const startInfo = computed(() => {
  if (mode.value === 'duel') {
    return pairs.value.length ? `已排 ${pairs.value.length} 组对位 · 共 ${pairs.value.length} 场` : '';
  }
  if (mode.value === 'aligned') {
    return picked.value.length >= 2
      ? `已选 ${picked.value.length} 位歌手 · 每位 ${alignCount.value} 张 · 共 ${alignedTotal.value} 场（胜场积分制）`
      : '';
  }
  if (mode.value === 'custom') {
    const p = planTournament(customPick.value.length);
    return customPick.value.length
      ? `已选 ${customPick.value.length} 张 · 赛程：${p ? describePlan(p) : '至少 4 张' }`
      : '';
  }
  if (mode.value === 'genre-era') {
    /**
     * ⚠️ 2026-09-23 用户："这里有个显示不同数量的赛程" ——
     * 以前这两句是**写死的文案**（"赛程按实际入池张数生成"），选 8 张还是 32 张一字不变，
     * 看着就像赛程没跟着规模变。现在直接按所选张数**算出真实场次**（走 v2 赛程公式），
     * 数字随档位实时变化。
     */
    const n = genreEraScale.value;
    const p = planTournament(n);
    const scope =
      genreOrEra.value === 'genre'
        ? `流派「${genre.value}」`
        : `${yearStart.value}–${yearEnd.value} 年`;
    return `${scope} · 参赛 ${n} 张 · 赛程：${p ? describePlan(p) : '至少 4 张'}（若库里不足，按实际入池张数生成）`;
  }
  if (!plan.value) return '';
  return `已选 ${totalSelected.value} 张 · 来自 ${picked.value.length} 位歌手 · 赛程：${describePlan(plan.value)}`;
});

const canStart = computed(() => {
  if (mode.value === 'duel') return pairs.value.length >= 1;
  if (mode.value === 'aligned') return picked.value.length >= 2 && !alignedInsufficient.value;
  if (mode.value === 'custom') return customPick.value.length >= 4;
  if (mode.value === 'genre-era') {
    return genreOrEra.value === 'genre' ? !!genre.value.trim() : yearStart.value <= yearEnd.value;
  }
  if (mode.value === 'artist') {
    return !!picked.value[0] && (pickStrategy.value !== 'picked' || selfPicked.value.length >= 4);
  }
  if (mode.value === 'multi-artist') {
    if (picked.value.length < 2) return false;
    if (pickStrategy.value === 'picked' && selfPicked.value.length < 4) return false;
    // 某位歌手一张合格专辑都没有 → 后端会直接报错，开局按钮别亮（其余歌手不受影响）
    return picked.value.every((a) => (artistPool.value[a.artistId]?.eligible.length ?? 0) >= 1);
  }
  return false;
});

const year = (d) => (d ? String(d).slice(0, 4) : '');

async function loadArtistPool(artistId) {
  if (artistPool.value[artistId]) return artistPool.value[artistId];
  const data = await musicApi.listArtistAlbums(artistId);
  const pool = { eligible: data.eligible || [], excluded: data.excluded || [], stats: data.stats || null };
  artistPool.value = { ...artistPool.value, [artistId]: pool };
  return pool;
}

watch(picked, async (list) => {
  for (const a of list) {
    try {
      await loadArtistPool(a.artistId);
    } catch (err) {
      ElMessage.error(err?.message || '加载专辑失败');
    }
  }
}, { deep: true });

function pickMode(v) {
  mode.value = v;
  candidates.value = [];
  picked.value = [];
  selfPicked.value = [];
  customPool.value = [];
  customPick.value = [];
  duelCandidates.value = [];
  duelAlbums.value = [];
  currentPair.value = [];
  pairs.value = [];
}

function toggleSelfPick(albumId) {
  const id = Number(albumId);
  selfPicked.value = selfPicked.value.map(Number).includes(id)
    ? selfPicked.value.filter((x) => Number(x) !== id)
    : [...selfPicked.value, id];
}

/** 常用组合：按名字搜到歌手 → 一键填好模式/歌手/规模 */
/** 拉取可用的组合（系统 + 我的）；拿不到就退回兜底，不影响使用 */
async function loadCombos() {
  try {
    const data = await comboApi.list();
    combos.value = data.list || [];
  } catch {
    combos.value = [];
  }
}

/**
 * 装填一个组合：带 artistId 的直接用（快）；只有名字的走搜索（兜底组合）
 * ------------------------------------------------------------
 * 2026-09-20 用户："这里的组合一点击就会跳到混战模式，那对位赛模式能创建组合吗？"
 * → 组合现在**自带赛制归属**（`scopeType`）：混战组合 → 进多歌手混战；对位组合 → 进对位赛。
 *   以前不管什么组合都无脑 `pickMode('multi-artist')`，对位组合也只能当混战打。
 */
async function applyCombo(c) {
  presetLoading.value = c.label;
  try {
    const isAligned = c.scopeType === 'aligned';
    pickMode(isAligned ? 'aligned' : 'multi-artist');
    if (isAligned) {
      alignCount.value = Number(c.alignCount) || 8;
      alignMode.value = c.alignMode === 'chrono' ? 'chrono' : 'ordinal';
    } else {
      pickStrategy.value = 'random';
      perArtistScale.value = c.perArtist || c.per || 8;
    }
    let found = [];
    if (c.artists && c.artists.length) {
      found = c.artists.map((a) => ({ artistId: a.artistId, name: a.name }));
    } else {
      for (const name of c.names || []) {
        // eslint-disable-next-line no-await-in-loop
        const data = await musicApi.searchArtists({ term: name, limit: 1 });
        const hit = (data.artists || [])[0];
        if (hit) found.push(hit);
      }
    }
    if (!found.length) {
      ElMessage.warning('这个组合里的歌手没搜到，请手动搜索添加');
      return;
    }
    picked.value = found;
    ElMessage.success(
      `已装好${isAligned ? '对位赛' : ''}「${c.label}」：${found.map((a) => a.name).join(isAligned ? ' × ' : ' vs ')}`,
    );
  } catch (err) {
    ElMessage.error(err?.message || '装填组合失败');
  } finally {
    presetLoading.value = '';
  }
}

/**
 * 把当前选好的歌手存成「我的组合」（只有本人可见）
 * ------------------------------------------------------------
 * ⚠️ 2026-09-21 用户："没法创建对位赛组合，目前此功能我实现不出来"。
 * 根因：这里原来把 `scopeType` **写死成 'multi-artist'** —— 于是在对位赛模式下
 * 收藏出来的组合是**混战组合**，点回去会跳到混战模式（用户感受就是"对位赛组合存不下 / 存了也不对"）。
 * 修法：按**当前模式**决定赛制归属，对位赛额外把对位张数与配对方式一起存下来。
 *   （后端 createSchema 早就支持 scopeType / alignCount / alignMode，只是前端没传。）
 */
async function saveCombo() {
  if (picked.value.length < 2) {
    ElMessage.info('先选 2 位以上歌手，才能存成组合');
    return;
  }
  let label = '';
  try {
    const r = await ElMessageBox.prompt(
      '给这个组合起个名字，之后在「我收藏组合」里一键装填',
      '收藏这个组合',
      {
        confirmButtonText: '保存',
        cancelButtonText: '取消',
        inputValue: picked.value.map((a) => a.name).join(' vs ').slice(0, 40),
        inputValidator: (v) => (v && v.trim() ? true : '名字不能为空'),
      },
    );
    label = r.value.trim();
  } catch {
    return; // 用户取消
  }
  savingCombo.value = true;
  try {
    // 按当前模式决定这枚组合属于哪一族（混战 / 对位），不再写死
    const isAligned = mode.value === 'aligned';
    const combo = await comboApi.create({
      label,
      scopeType: isAligned ? 'aligned' : 'multi-artist',
      perArtist: isAligned ? undefined : perArtistScale.value,
      alignCount: isAligned ? alignCount.value : undefined,
      alignMode: isAligned ? alignMode.value : undefined,
      artists: picked.value.map((a) => ({
        artistId: a.artistId,
        name: a.name,
        ...(isAligned ? {} : { albumCount: perArtistScale.value }),
      })),
    });
    combos.value = [combo, ...combos.value.filter((c) => c.comboId !== combo.comboId)];
    ElMessage.success(`已收藏${isAligned ? '对位赛' : '混战'}组合「${combo.label}」`);
  } catch (err) {
    ElMessage.error(err?.message || '收藏组合失败');
  } finally {
    savingCombo.value = false;
  }
}

/** 删除自己的组合（系统组合没有 × 按钮） */
async function removeCombo(c) {
  if (!c.comboId) return;
  try {
    await comboApi.remove(c.comboId);
    combos.value = combos.value.filter((x) => x.comboId !== c.comboId);
    ElMessage.success('已删除这个组合');
  } catch (err) {
    ElMessage.error(err?.message || '删除失败');
  }
}

function setScale(s) {
  if (mode.value === 'artist') singerScale.value = s;
  else perArtistScale.value = s;
}

async function doSearch() {
  if (!term.value.trim()) return;
  searching.value = true;
  try {
    const data = await musicApi.searchArtists({ term: term.value.trim(), limit: 12 });
    // ⚠️ 2026-09-20 修（用户报"搜不出 Adele / Travis Scott 这种大牌"）：
    //   旧逻辑把**已选歌手直接 filter 掉**，也不排序 —— 结果用户搜一位已经在池子里的歌手，
    //   他本人从列表里消失，屏幕上只剩一堆无关的人（搜 "travis scoot" 出 SZA / The Chainsmokers），
    //   看起来就是"大牌搜不出来"。现在改成：
    //     ① **已选歌手照样显示**，只是标成「已加入」不可点（用户能看到"他已经在了"）
    //     ② 按"和搜索词的相似度"排序，最像的排最前（iTunes 自己的相关度会把手滑漏字母的查询排乱）
    //     ③ 不再硬截 6 个，给 8 个位置
    candidates.value = rankArtistMatches(data.artists || [], term.value.trim(), picked.value).slice(0, 8);
    if (!candidates.value.length) ElMessage.info('没有找到匹配的歌手，换个说法试试');
    else loadArtistPhotos();
  } catch (err) {
    ElMessage.error(err?.message || '搜索失败');
  } finally {
    searching.value = false;
  }
}

/**
 * 搜索结果先秒回，歌手本人照片再异步补上
 * ------------------------------------------------------------
 * ⚠️ 2026-09-20：一开始把"抓 Apple Music 页取歌手图"塞进了搜索接口里 ——
 *  12 位歌手 × 1~2 秒 = 搜索要十几秒，第一次搜直接超时（用户报"搜不出这位歌手"）。
 *  改成两段式：搜索只查库（毫秒级）→ 结果先渲染（头像先用代表作封面代位）→
 *  真图到了再原地替换，用户几乎无感。
 */
async function loadArtistPhotos() {
  const ids = candidates.value.map((a) => a.artistId);
  if (!ids.length) return;
  try {
    const d = await musicApi.artistPhotos(ids);
    const photos = d?.photos || {};
    if (!Object.keys(photos).length) return;
    candidates.value = candidates.value.map((a) =>
      photos[a.artistId] ? { ...a, photoUrl: photos[a.artistId] } : a,
    );
  } catch {
    /* 补图失败不影响搜索本身 */
  }
}

/** 归一化：小写、去重音、去空格与标点（"Adéle" → "adele"） */
const normName = (s) =>
  String(s || '')
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[\s\-_.·&'’,，。]/g, '');

/** 名字相似度打分：越像分越高（0 = 完全不像） */
function matchScore(name, term) {
  const n = normName(name);
  const t = normName(term);
  if (!n || !t) return 0;
  if (n === t) return 1000;
  if (n.startsWith(t)) return 900 - Math.min(n.length, 60);
  if (t.startsWith(n)) return 800 - Math.min(n.length, 60);
  if (n.includes(t) || t.includes(n)) return 600;
  // 公共前缀比例：容忍"手滑漏一个字母"（travisscoot ≈ travisscott → 9/11）
  let i = 0;
  while (i < n.length && i < t.length && n[i] === t[i]) i += 1;
  return Math.round((i / Math.max(n.length, t.length)) * 500);
}

/**
 * 给搜索结果排序并标注「是否已在池子里」。
 * ⚠️ 同名不同 id 也算已加入 —— iTunes 同一位歌手常有多条记录（分地区），
 *    只比 id 会漏判 → 出现"看着像重复项"的困惑。
 */
function rankArtistMatches(list, term, chosen) {
  const chosenIds = new Set(chosen.map((p) => p.artistId));
  const chosenNames = new Set(chosen.map((p) => normName(p.name)));
  return list
    .map((a, i) => ({
      ...a,
      _score: matchScore(a.name, term),
      _index: i,
      taken: chosenIds.has(a.artistId) || chosenNames.has(normName(a.name)),
    }))
    .sort((x, y) => y._score - x._score || x._index - y._index);
}

function quickSearch(name) {
  term.value = name;
  doSearch();
}

function addArtist(artist) {
  if (picked.value.some((a) => a.artistId === artist.artistId)) return;
  const max = ['multi-artist', 'genre-era'].includes(mode.value) ? 6 : mode.value === 'aligned' ? 4 : 1;
  if (picked.value.length >= max) {
    ElMessage.warning(`该模式最多选择 ${max} 位歌手`);
    return;
  }
  if (mode.value === 'artist') picked.value = [artist];
  else picked.value = [...picked.value, artist];
  candidates.value = [];
  term.value = '';
}

function removeArtist(artistId) {
  picked.value = picked.value.filter((a) => a.artistId !== artistId);
}

// —— 手动挑选 ——
/** 单场对决的专辑数上限（100 张 ≈「大逃杀模式」的规模，属彩蛋方向，正式版再议） */
const MAX_CUSTOM = 100;
/** 正在加载专辑的歌手 id（给候选 chip 一个"加载中…"状态，避免看起来像卡死） */
const loadingArtistId = ref(null);
/** 刚加入的 albumId（入场动画用）+ 最近一次「已添加」提示文案 */
const justAdded = ref([]);
const lastAdded = ref('');
function flashAdded(ids) {
  justAdded.value = ids.map(Number);
  window.setTimeout(() => {
    justAdded.value = [];
  }, 900);
}

async function loadCustomAlbums(artist) {
  // 加载反馈：拉一位没缓存过的歌手要打一次 iTunes + 准入过滤，可能要好几秒，
  // 以前点了没任何反应，用户会以为界面卡死了（2026-09-19 用户报"无法取消勾选 界面卡死"）
  if (loadingArtistId.value) return;
  loadingArtistId.value = artist.artistId;
  try {
    const data = await musicApi.listArtistAlbums(artist.artistId);
    const list = (data.eligible || []).map((al) => ({
      ...al,
      albumId: Number(al.albumId),
      _artistName: artist.name,
    }));
    const seen = new Set(customPool.value.map((a) => Number(a.albumId)));
    const fresh = list.filter((a) => !seen.has(Number(a.albumId)));
    customPool.value = [...customPool.value, ...fresh];
    if (!list.length) {
      ElMessage.info('该歌手暂无合格专辑');
      return;
    }
    if (fresh.length) {
      // 明确反馈 + 入场动画：让人看到"我点的那位歌手，专辑真的加进来了"
      lastAdded.value = `已添加 ${artist.name} 的 ${fresh.length} 张专辑（池里共 ${customPool.value.length} 张）`;
      flashAdded(fresh.map((a) => a.albumId));
      ElMessage.success(`已添加 ${artist.name} 的 ${fresh.length} 张专辑，点封面即可勾选入池`);
    } else {
      ElMessage.info(`${artist.name} 的专辑都已经在池子里了`);
    }
  } catch (err) {
    ElMessage.error(err?.message || '加载专辑失败');
  } finally {
    loadingArtistId.value = null;
  }
}

/** 勾选状态统一按数字比较（彻底排除字符串/数字类型不一致导致的"点不动"） */
function isPicked(albumId) {
  const id = Number(albumId);
  return customPick.value.some((x) => Number(x) === id);
}

function toggleCustom(albumId) {
  const id = Number(albumId);
  if (!isPicked(id) && customPick.value.length >= MAX_CUSTOM) {
    ElMessage.warning(`单场对决最多 ${MAX_CUSTOM} 张专辑`);
    return;
  }
  customPick.value = isPicked(id)
    ? customPick.value.filter((x) => Number(x) !== id)
    : [...customPick.value, id];
}

function clearCustomPick() {
  customPick.value = [];
}

function selectAllCustom() {
  customPick.value = customPool.value.slice(0, MAX_CUSTOM).map((a) => Number(a.albumId));
}

// —— 指定对决 ——
async function duelSearch() {
  if (!duelTerm.value.trim()) return;
  duelSearching.value = true;
  try {
    const data = await musicApi.searchArtists({ term: duelTerm.value.trim(), limit: 12 });
    // 与主搜索同一套：按相似度排序 + 已载入的标出来（不静默过滤）
    duelCandidates.value = rankArtistMatches(data.artists || [], duelTerm.value.trim(), duelArtists.value).slice(0, 8);
    if (!duelCandidates.value.length) ElMessage.info('没有找到匹配的歌手');
    else {
      const ids = duelCandidates.value.map((a) => a.artistId);
      musicApi
        .artistPhotos(ids)
        .then((d) => {
          const photos = d?.photos || {};
          if (!Object.keys(photos).length) return;
          duelCandidates.value = duelCandidates.value.map((a) =>
            photos[a.artistId] ? { ...a, photoUrl: photos[a.artistId] } : a,
          );
        })
        .catch(() => {});
    }
  } catch (err) {
    ElMessage.error(err?.message || '搜索失败');
  } finally {
    duelSearching.value = false;
  }
}

/**
 * 载入某位歌手的专辑 —— **累积**进候选池（以前是整池替换，导致永远只有一位歌手 →
 * 只能"自己打自己"，守则 38③ 就是指这个）。
 */
async function loadDuelAlbums(artist) {
  if (duelArtists.value.some((a) => a.artistId === artist.artistId)) {
    ElMessage.info(`「${artist.name}」的专辑已经在候选池里了`);
    return;
  }
  try {
    const data = await musicApi.listArtistAlbums(artist.artistId);
    const list = data.eligible || [];
    if (!list.length) {
      ElMessage.info('该歌手暂无合格专辑');
      return;
    }
    duelArtistName.value = artist.name;
    duelArtists.value = [...duelArtists.value, { artistId: artist.artistId, name: artist.name }];
    // 按 albumId 去重后追加
    const seen = new Set(duelAlbums.value.map((a) => a.albumId));
    duelAlbums.value = [...duelAlbums.value, ...list.filter((a) => !seen.has(a.albumId))];
    ElMessage.success(`已载入「${artist.name}」${list.length} 张合格专辑`);
  } catch (err) {
    ElMessage.error(err?.message || '加载专辑失败');
  }
}

function removeDuelArtist(artistId) {
  const gone = duelArtists.value.find((a) => a.artistId === artistId);
  duelArtists.value = duelArtists.value.filter((a) => a.artistId !== artistId);
  // 该歌手的专辑一并撤出候选池；已经排进对阵表的组**保留**（用户自己排的，不擅自删）
  const keep = new Set(
    pairs.value.flatMap((p) => p.map((x) => x.artistId)).filter(Boolean),
  );
  duelAlbums.value = duelAlbums.value.filter(
    (a) => a.artistId !== artistId || keep.has(a.artistId),
  );
  // 待成组里若含该歌手的专辑也一并撤掉
  currentPair.value = currentPair.value.filter((a) => a.artistId !== artistId);
  if (gone) ElMessage.info(`已移除「${gone.name}」`);
}

/** 从"待成组"里拿掉一张（点卡片也能取消，操作要可逆） */
function unpickDuelAlbum(al) {
  currentPair.value = currentPair.value.filter((x) => x.albumId !== al.albumId);
}

/** 点一张专辑：进"待成组"；凑够 2 张自动成一组落到下方对阵表 */
function addDuelAlbum(al) {
  if (isPaired(al)) return;
  // 再点一次 = 取消（可逆，不会点了就下不来）
  if (isPending(al)) {
    unpickDuelAlbum(al);
    return;
  }
  currentPair.value = [...currentPair.value, al];
  if (currentPair.value.length === 2) {
    const [a, b] = currentPair.value;
    pairs.value = [...pairs.value, [a, b]];
    currentPair.value = [];
    ElMessage.success(
      a.artistId === b.artistId
        ? `第 ${pairs.value.length} 组已排好（同室操戈 · 都是${a.artistName}）`
        : `第 ${pairs.value.length} 组已排好`,
    );
  }
}

function removePair(i) {
  pairs.value = pairs.value.filter((_, idx) => idx !== i);
}

async function onCreate() {
  if (!canStart.value) {
    return ElMessage.warning('还差一点：请先完成上面的选择');
  }
  const payload = {};
  if (mode.value === 'duel') {
    payload.scopeType = 'duel';
    payload.pairs = pairs.value.map((p) => [p[0].albumId, p[1].albumId]);
  } else if (mode.value === 'aligned') {
    // B 线：赛制不变，不传 tournamentVersion（走旧赛制）
    payload.scopeType = 'aligned';
    payload.artists = picked.value.map((a) => ({ artistId: a.artistId }));
    payload.alignCount = alignCount.value;
    payload.alignMode = alignMode.value;
  } else if (mode.value === 'custom') {
    payload.scopeType = 'custom';
    payload.albumIds = customPick.value;
    payload.tournamentVersion = 2;
  } else if (mode.value === 'genre-era') {
    payload.tournamentVersion = 2;
    // ⚠️ 2026-09-23 修复：此前 genre/era 分支从不发 albumCount，后端恒按 ERA_MAX_POOL(32) 封顶，
    //    用户在前端无论怎么选"几张参战"都无效。现在把选中的张数真正传进去（后端 resolvePool 已支持）。
    payload.albumCount = genreEraScale.value;
    // 地区/语种筛选（不勾就不发，后端视为"混着打"，与改动前行为一致）
    if (zoneFilter.value) payload.zone = zoneFilter.value;
    if (langFilter.value) payload.lang = langFilter.value;
    if (genreOrEra.value === 'genre') {
      payload.scopeType = 'genre';
      payload.genre = genre.value.trim();
    } else {
      payload.scopeType = 'era';
      payload.startYear = yearStart.value;
      payload.endYear = yearEnd.value;
    }
  } else if (mode.value === 'artist') {
    payload.scopeType = 'artist';
    payload.artistId = picked.value[0].artistId;
    payload.albumCount = singerScale.value;
    payload.pick = pickStrategy.value;
    if (pickStrategy.value === 'picked') payload.albumIds = selfPicked.value.map(Number);
    payload.tournamentVersion = 2;
  } else {
    payload.scopeType = 'multi-artist';
    payload.pick = pickStrategy.value;
    payload.artists = picked.value.map((a) => {
      const entry = { artistId: a.artistId, albumCount: perArtistScale.value };
      if (pickStrategy.value === 'picked') {
        const pool = artistPool.value[a.artistId]?.eligible || [];
        const want = selfPicked.value.map(Number);
        const ids = pool.map((x) => Number(x.albumId)).filter((id) => want.includes(id));
        if (ids.length) entry.albumIds = ids;
      }
      return entry;
    });
    payload.tournamentVersion = 2;
  }

  creating.value = true;
  try {
    const battle = await battleApi.create(payload);
    // 数字同源校验：后端算出的 stepTotal 应与前端预估一致
    if (payload.tournamentVersion === 2 && plan.value && battle.stepTotal !== plan.value.totalSteps) {
      ElMessage.warning(
        `赛程预估 ${plan.value.totalSteps} 场，实际 ${battle.stepTotal} 场（以实际为准）`,
      );
    } else {
      ElMessage.success('对决已创建');
    }
    router.push({ name: 'battle-pk', params: { id: battle.battleId } });
  } catch (err) {
    ElMessage.error(err?.message || '创建失败');
  } finally {
    creating.value = false;
  }
}
</script>

<style scoped>
.create {
  padding-bottom: var(--sp-6);
}

.sub {
  margin-top: var(--sp-3);
  font-size: var(--fs-sm);
  max-width: 620px;
}

.searchrow {
  display: flex;
  /* 不加这句，按钮会被 flex 默认 stretch 拉到和输入框一样高（48px），
     渲染成一个圆柱形的"蓝色药丸"，看着像坏掉了 */
  align-items: center;
  gap: var(--sp-3);
  max-width: 560px;
}

.ipt {
  width: 100%;
  font: inherit;
  font-size: 15px;
  padding: 11px 14px;
  border-radius: 12px;
  border: 1px solid var(--gbd);
  background: var(--glass2);
  color: var(--text);
  outline: none;
  transition: border 0.2s;
}
.ipt:focus {
  border-color: var(--brand);
}

.hint {
  margin-top: 10px;
  font-size: var(--fs-sm);
  color: var(--text2);
}
.hint b {
  color: var(--brand-deep);
}
/* 「已添加 XX 的 N 张专辑」即时反馈条 */
.addedtip {
  margin-top: 10px;
  display: inline-block;
  padding: 6px 14px;
  border-radius: 999px;
  font-size: var(--fs-sm);
  font-weight: 700;
  color: var(--brand-ink, #04263c);
  background: var(--brand);
  animation: tipPop 0.5s var(--ease-out, cubic-bezier(0.22, 1, 0.36, 1)) both;
}
.warnline {
  color: var(--danger);
  background: rgba(239, 68, 68, 0.08);
  border: 1px solid rgba(239, 68, 68, 0.22);
  border-radius: 10px;
  padding: 8px 12px;
}
/* 新加入专辑的入场动画：「我点的歌手，专辑进来了」的视效反馈 */
.pk.just {
  animation: pkPop 0.55s var(--ease-out, cubic-bezier(0.22, 1, 0.36, 1)) both;
}
@keyframes pkPop {
  0% { transform: translateY(12px) scale(0.9); opacity: 0; }
  60% { transform: translateY(-4px) scale(1.03); opacity: 1; }
  100% { transform: none; opacity: 1; }
}
@keyframes tipPop {
  0% { transform: translateY(-6px); opacity: 0; }
  100% { transform: none; opacity: 1; }
}

.chip.on {
  border-color: var(--brand);
  background: rgba(14, 165, 233, 0.12);
}

/* 「已选歌手」单独一排：加一条虚线分隔 + 左侧小标签，跟下面的搜索结果区分开 */
.pickedrow {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
  margin-top: 14px;
  padding-top: 12px;
  border-top: 1px dashed var(--line);
}
.pickedlab {
  flex: 0 0 auto;
  font-size: var(--fs-xs);
  font-weight: 700;
  color: var(--brand-deep);
  background: rgba(14, 165, 233, 0.12);
  border: 1px solid rgba(14, 165, 233, 0.28);
  border-radius: 999px;
  padding: 3px 10px;
}

/* 「我收藏组合」：组合按钮上的删除小叉 + 「收藏当前组合」按钮 */
.combowrap {
  position: relative;
  display: inline-flex;
}
/**
 * 我收藏的组合：金色框 + 金色小标，跟内置（系统）组合的蓝白框区分开
 * （2026-09-18 用户要求「我自己收藏的对决组合最好单独做个和默认不一样的框架颜色」）。
 * 排序上也让我的排在前面 —— 见后端 listCombos。
 */
.combowrap.mine .preset {
  border-color: rgba(224, 135, 0, 0.55);
  background: rgba(224, 135, 0, 0.12);
  color: var(--gold);
  font-weight: 700;
}
.combowrap.mine .preset:hover {
  border-color: var(--gold);
  box-shadow: var(--gsh-hi), 0 4px 14px rgba(224, 135, 0, 0.28);
}
.minetag {
  font-size: 12px;
  font-weight: 800;
  letter-spacing: 0.04em;
  padding: 1px 7px;
  border-radius: 999px;
  background: var(--gold);
  color: #fff;
  line-height: 1.6;
}
.combox {
  position: absolute;
  right: -5px;
  top: -7px;
  width: 17px;
  height: 17px;
  border-radius: 50%;
  background: var(--danger);
  color: #fff;
  font-size: 13px;
  line-height: 16px;
  text-align: center;
  cursor: pointer;
  opacity: 0;
  transition: opacity 0.18s var(--ease-out);
}
.combowrap:hover .combox {
  opacity: 1;
}
.addcombo {
  border-style: dashed;
  color: var(--brand-deep);
}
.addcombo:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

/* =====================================================================
   组合区视觉整改（2026-09-21 用户："混战感觉不好看"）
   ---------------------------------------------------------------------
   原来每个组合 chip 上挂了**两枚**奖章样的小彩标（「我的」金标 + 「混战/对位」铜标），
   13 个 chip 并排 = 26 枚彩标，整片像贴满了勋章，颜色还很杂（金 + 蓝 + 混战橙）。

   ⚠️ 关键事实：`.preset` 是**全站共用**类（首页/其它页的胶囊也用它），
      所以下面所有规则都带 `.combowrap` / `.combopanel` 前缀，绝不外溢。

   改法（只重排信息、不改赛制语义）：
     ① 赛制标移到 chip 最左当"细色条"（混战=蓝 / 对位=青），不再是一枚奖章；
     ② 「我的」不再单独挂标 —— 我的组合整条 chip 已经是金框，重复；
     ③ chip 之间留白加宽、内容区分组，标题句改短；
     ④ 整块加一个浅面板容器，让它和上面的「已选歌手」拉开层次。
   ===================================================================== */
.combopanel {
  margin-top: 14px;
  padding: 14px 16px 16px;
  border-radius: var(--r-s);
  border: 1px solid var(--gbd);
  background: var(--glass2);
}
.combopanel > h4 {
  margin: 0;
  font-size: 15px;
}
.combopanel .presets {
  margin-top: 12px;
  gap: 11px;
}
/* chip：左边一条 3px 赛制色条（用 ::before 做，避免多包一层 DOM） */
.combowrap .preset {
  position: relative;
  gap: 10px;
  padding: 8px 15px 8px 16px;
  overflow: hidden;
  font-weight: 600;
}
.combowrap .preset::before {
  content: '';
  position: absolute;
  left: 0;
  top: 0;
  bottom: 0;
  width: 3px;
  background: var(--brand);
}
.combowrap .preset.sc-aligned::before {
  background: #14b8a6; /* 对位 = 青，与模式大厅的族色一致 */
}
/* 我的组合：金色描边 + 极淡金底（比原来的金底金字克制，文字仍保持可读的深色） */
.combowrap.mine .preset {
  border-color: rgba(224, 135, 0, 0.5);
  background: rgba(224, 135, 0, 0.07);
  color: var(--text);
}
.combowrap.mine .preset:hover {
  border-color: var(--gold);
  box-shadow: var(--gsh-hi), 0 4px 14px rgba(224, 135, 0, 0.22);
}
/* 赛制标：细长小签，不再是奖章 */
.combowrap .minetag {
  background: transparent;
  padding: 0;
  font-size: 12px;
  font-weight: 700;
  letter-spacing: 0.02em;
  color: var(--brand-deep);
  border-radius: 0;
}
.combowrap .minetag.al {
  color: #0d9488;
}
.combox {
  opacity: 0;
  transition: opacity 0.18s var(--ease-out);
}
.combowrap:hover .combox {
  opacity: 1;
}

.yearrow {
  display: flex;
  align-items: center;
  gap: var(--sp-3);
  flex-wrap: wrap;
}
.ipt.year {
  width: 120px;
}
.dash {
  color: var(--text3);
}

.excluded {
  margin-top: var(--sp-3);
  font-size: var(--fs-sm);
}
.excluded ul {
  margin: 6px 0 0;
  padding-left: 20px;
  color: var(--text2);
}
.tag {
  color: var(--danger);
  font-size: var(--fs-xs);
}

.pairlist {
  margin-top: 14px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

/* 「还有 N 张」虚位卡：模糊占位 + 省略号 + 计数，提示用户这不是全部 */
.pk.more {
  cursor: default;
}
.pk.more .art {
  display: grid;
  place-items: center;
  background: var(--glass2);
  border: 1px dashed var(--gbd);
  box-shadow: none;
  filter: blur(0.4px);
  opacity: 0.75;
}
.pk.more .dots3 {
  font-size: 30px;
  line-height: 1;
  letter-spacing: 3px;
  color: var(--text3);
}
.pk.more b,
.pk.more span {
  color: var(--text3);
}
.pairrow {
  display: grid;
  /* 序号 | 左（封面+名） | VS | 右（封面+名） | 同室操戈标 | 移除 */
  grid-template-columns: 72px minmax(0, 1fr) auto minmax(0, 1fr) auto auto;
  align-items: center;
  gap: 12px;
  padding: 10px 14px;
  border: 1px solid var(--gbd);
  border-radius: var(--r-s);
  background: var(--glass2);
}
.pairrow .pcell {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
}
.pairrow .pcell img {
  width: 34px;
  height: 34px;
  border-radius: 6px;
  object-fit: cover;
  flex: 0 0 auto;
}
.pairrow .nm {
  font-size: var(--fs-sm);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.sibflag {
  font-style: normal;
  font-size: var(--fs-xs);
  color: var(--brand-deep);
  background: rgba(14, 165, 233, 0.12);
  border: 1px solid rgba(14, 165, 233, 0.28);
  border-radius: 999px;
  padding: 2px 8px;
}

/* 流派歌手扩充面板 */
.grow {
  margin-top: 12px;
  padding: 12px 14px;
  border: 1px dashed var(--line);
  border-radius: var(--r-s);
  background: rgba(14, 165, 233, 0.05);
}
.growhd {
  display: flex;
  align-items: baseline;
  gap: 10px;
  flex-wrap: wrap;
  font-size: var(--fs-sm);
}
.growhd b {
  font-size: 15px;
}
.growhd span {
  color: var(--text3);
  font-size: var(--fs-xs);
}
.growrow {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
  margin-top: 10px;
}
.glist {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-top: 10px;
  max-height: 190px;
  overflow-y: auto;
}
.pickhint {
  margin-top: 8px;
}
.pickhint b {
  color: var(--brand-deep);
}

/* 待成组托盘：明确显示"还差几张"，选错可点 × 撤销 */
.pending {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
  margin: 10px 0 12px;
  padding: 10px 12px;
  border: 1px dashed rgba(14, 165, 233, 0.4);
  border-radius: var(--r-s);
  background: rgba(14, 165, 233, 0.06);
}
.chipart {
  width: 20px;
  height: 20px;
  border-radius: 5px;
  object-fit: cover;
  margin-right: 4px;
  vertical-align: -5px;
}

/* 指定对决里专辑卡的三种状态：
   普通 = 可选；.pick = 已在"待成组"；.done = 已排进对阵表（用掉了，缩小变灰）
   ⚠️ 它不走 .off，所以必须单独压掉默认对勾，否则又变成"一进来全打勾" */
.pk.duelpk .ck {
  opacity: 0;
  transform: scale(0.6);
}
.pk.duelpk.pick .ck,
.pk.duelpk.done .ck {
  opacity: 1;
  transform: scale(1);
}
.pk.duelpk.done .ck {
  background: rgba(255, 255, 255, 0.75);
  border-color: var(--line);
}
.pk.duelpk.done .ck svg {
  fill: var(--text3);
}
.pk.pick .art {
  box-shadow: 0 0 0 2px var(--brand), 0 14px 30px rgba(8, 58, 92, 0.3);
}
.pk.done {
  cursor: not-allowed;
}
.pk.done .art {
  opacity: 0.34;
  filter: grayscale(0.75);
  transform: scale(0.9);
}
.pk.done b,
.pk.done span {
  opacity: 0.55;
}
.pairrow .k {
  font-size: var(--fs-sm);
  color: var(--text3);
}
.pairrow .nm {
  color: var(--text);
}
.vs-mini {
  color: var(--brand);
  font-weight: 700;
}
.mini-x {
  font-size: var(--fs-sm);
  color: var(--danger);
  background: none;
  border: 0;
  cursor: pointer;
}

@media (max-width: 980px) {
  .modes {
    grid-template-columns: repeat(2, 1fr);
  }
  .pool {
    grid-template-columns: repeat(4, 1fr);
  }
}
@media (max-width: 640px) {
  .modes,
  .pool {
    grid-template-columns: repeat(2, 1fr);
  }
  .pairrow {
    grid-template-columns: 1fr;
  }
}

/* ⭐ 这册内置歌手（2026-09-24 第十三批）：把这一册人平铺出来，多了就内部滚动 */
.wllist {
  max-height: 260px;
  overflow-y: auto;
}
</style>
