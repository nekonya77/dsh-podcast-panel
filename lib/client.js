// dsh-podcast-panel — browser half.
//
// 由 dsh-client-modules 从 /plugins/dsh-podcast-panel/client.js 加载，
// 通过 vendored cordis Loader 的 lazy-CJS 模块表执行。
// 侧栏挂一个「播客」入口，main slot 渲染播放器面板。

(function (root) {
  if (!root.__ModuleLoader__ || typeof root.__ModuleLoader__.load !== "function") return;

  root.__ModuleLoader__.load({
    id: "dsh-podcast-panel",
    factory: (require) => {
      "use strict";

      const module = { exports: {} };
      const exports = module.exports;

      const React = require("react");
      const h = React.createElement;
      const useState = React.useState;
      const useEffect = React.useEffect;
      const useMemo = React.useMemo;
      const useRef = React.useRef;
      const useCallback = React.useCallback;

      const API = "/podcast-panel";
      const GROUP_NO = "1132348296";

      const C = {
        accent: "#5686fe",
        border: "rgba(128,128,128,0.24)",
        soft: "rgba(128,128,128,0.12)",
        muted: 0.62,
      };

      function fmtDuration(seconds) {
        const s = Math.max(0, Math.round(Number(seconds) || 0));
        const h = Math.floor(s / 3600);
        const m = Math.floor((s % 3600) / 60);
        const r = s % 60;
        if (h > 0) return h + ":" + String(m).padStart(2, "0") + ":" + String(r).padStart(2, "0");
        return m + ":" + String(r).padStart(2, "0");
      }

      function fmtDate(iso) {
        if (!iso) return "";
        const d = new Date(iso);
        if (Number.isNaN(d.getTime())) return "";
        return d.getMonth() + 1 + "月" + d.getDate() + "日";
      }

      async function api(path, options) {
        const response = await fetch(API + path, options);
        const text = await response.text();
        let body = null;
        try {
          body = text ? JSON.parse(text) : null;
        } catch {
          body = { error: text };
        }
        if (!response.ok) throw new Error((body && body.error) || "HTTP " + response.status);
        return body;
      }

      function post(path, payload) {
        return api(path, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(payload || {}),
        });
      }

      function Pill(props) {
        return h(
          "span",
          {
            style: {
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
              padding: "2px 8px",
              borderRadius: 999,
              background: C.soft,
              fontSize: 12,
              opacity: 0.9,
            },
          },
          props.children
        );
      }

      function EpisodeRow(props) {
        const ep = props.ep;
        const progress = ep.progress;
        const pct = progress && ep.duration ? Math.min(100, Math.round((progress.pos / ep.duration) * 100)) : 0;
        return h(
          "button",
          {
            onClick: () => props.onPlay(ep),
            title: ep.title,
            style: {
              display: "block",
              width: "100%",
              textAlign: "left",
              padding: "10px 12px",
              border: "none",
              borderBottom: "1px solid " + C.border,
              background: props.active ? C.soft : "transparent",
              color: "inherit",
              cursor: "pointer",
              font: "inherit",
            },
          },
          h(
            "div",
            { style: { display: "flex", gap: 8, alignItems: "baseline" } },
            h(
              "div",
              { style: { flex: 1, fontSize: 13, lineHeight: 1.45, fontWeight: props.active ? 600 : 500 } },
              ep.title
            ),
            progress && progress.done
              ? h("span", { style: { fontSize: 11, color: C.accent } }, "已听完")
              : pct > 0
                ? h("span", { style: { fontSize: 11, opacity: C.muted } }, pct + "%")
                : null
          ),
          h(
            "div",
            { style: { marginTop: 4, fontSize: 11, opacity: C.muted, display: "flex", gap: 10 } },
            h("span", null, fmtDate(ep.pub)),
            ep.duration ? h("span", null, fmtDuration(ep.duration)) : null,
            progress && progress.pos && !progress.done
              ? h("span", null, "上次听到 " + fmtDuration(progress.pos))
              : null
          ),
          pct > 0 && !(progress && progress.done)
            ? h("div", { style: { marginTop: 6, height: 2, background: C.border, borderRadius: 2 } },
                h("div", { style: { width: pct + "%", height: 2, background: C.accent, borderRadius: 2 } }))
            : null
        );
      }

      function Player(props) {
        const ep = props.ep;
        return h(
          "div",
          {
            style: {
              borderTop: "1px solid " + C.border,
              padding: "10px 12px 12px",
              background: "rgba(128,128,128,0.06)",
            },
          },
          h("div", { style: { fontSize: 12, fontWeight: 600, marginBottom: 8, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" } }, ep.title),
          h(
            "div",
            { style: { display: "flex", alignItems: "center", gap: 10 } },
            h(
              "button",
              {
                onClick: props.onToggle,
                style: { width: 36, height: 36, borderRadius: 18, border: "none", background: C.accent, color: "#fff", cursor: "pointer", fontSize: 14 },
              },
              props.playing ? "❚❚" : "▶"
            ),
            h(
              "button",
              { onClick: () => props.onSeek(-15), style: { border: "1px solid " + C.border, background: "transparent", color: "inherit", borderRadius: 6, padding: "4px 6px", fontSize: 11, cursor: "pointer" } },
              "-15s"
            ),
            h(
              "button",
              { onClick: () => props.onSeek(15), style: { border: "1px solid " + C.border, background: "transparent", color: "inherit", borderRadius: 6, padding: "4px 6px", fontSize: 11, cursor: "pointer" } },
              "+15s"
            ),
            h(
              "select",
              {
                value: String(props.speed),
                onChange: (e) => props.onSpeed(Number(e.target.value)),
                style: { border: "1px solid " + C.border, background: "transparent", color: "inherit", borderRadius: 6, padding: "4px", fontSize: 11, cursor: "pointer" },
                title: "播放速度",
              },
              ["0.75", "1", "1.25", "1.5", "1.75", "2"].map((v) => h("option", { key: v, value: v }, v + "×"))
            ),
            h("div", { style: { flex: 1, fontSize: 11, opacity: C.muted, textAlign: "right", fontVariantNumeric: "tabular-nums" } },
              fmtDuration(props.pos) + " / " + fmtDuration(props.dur))
          ),
          h("input", {
            type: "range",
            min: 0,
            max: Math.max(1, Math.round(props.dur || ep.duration || 1)),
            value: Math.min(props.pos, props.dur || ep.duration || 0),
            onChange: (e) => props.onScrub(Number(e.target.value)),
            style: { width: "100%", marginTop: 8, accentColor: C.accent },
          }),
          h(
            "div",
            { style: { display: "flex", gap: 10, marginTop: 6, alignItems: "center" } },
            h(
              "button",
              {
                onClick: props.onSummary,
                style: { border: "1px solid " + C.border, background: "transparent", color: "inherit", borderRadius: 6, padding: "4px 8px", fontSize: 11, cursor: "pointer" },
              },
              "三行摘要"
            ),
            ep.link
              ? h("a", { href: ep.link, target: "_blank", rel: "noreferrer", style: { fontSize: 11, color: C.accent } }, "节目页")
              : null,
            h("span", { style: { flex: 1 } }),
            h("span", { style: { fontSize: 11, opacity: 0.55 } }, "AI 学习群 " + GROUP_NO)
          )
        );
      }

      function SummaryCard(props) {
        const data = props.data;
        if (!data) return null;
        return h(
          "div",
          { style: { padding: "10px 12px", borderTop: "1px solid " + C.border, background: "rgba(86,134,254,0.06)" } },
          h("div", { style: { fontSize: 12, fontWeight: 600, marginBottom: 6 } }, "这集在讲什么"),
          data.summary.length
            ? h(
                "ol",
                { style: { margin: 0, paddingLeft: 18, fontSize: 12, lineHeight: 1.7 } },
                data.summary.map((line, i) => h("li", { key: i }, line))
              )
            : h("div", { style: { fontSize: 12, opacity: C.muted } }, "这集没有 show notes，先听听看。"),
          data.quote
            ? h("div", { style: { marginTop: 8, fontSize: 12, fontStyle: "italic", opacity: 0.85 } }, "「" + data.quote + "」")
            : null
        );
      }

      function PodcastPanel() {
        const [state, setState] = useState(null);
        const [error, setError] = useState("");
        const [feedUrl, setFeedUrl] = useState("");
        const [busy, setBusy] = useState(false);
        const [activeFeed, setActiveFeed] = useState("all");
        const [current, setCurrent] = useState(null);
        const [playing, setPlaying] = useState(false);
        const [pos, setPos] = useState(0);
        const [dur, setDur] = useState(0);
        const [speed, setSpeed] = useState(1);
        const [summary, setSummary] = useState(null);
        const audioRef = useRef(null);
        const lastSave = useRef(0);

        const load = useCallback(async () => {
          try {
            const next = await api("/api/state");
            setState(next);
            setError("");
            if (next.settings && next.settings.speed) setSpeed(next.settings.speed);
          } catch (err) {
            setError(String(err.message || err));
          }
        }, []);

        useEffect(() => {
          load();
        }, [load]);

        useEffect(() => {
          const audio = audioRef.current;
          if (!audio) return;
          function onTime() {
            setPos(audio.currentTime || 0);
            const ep = current;
            if (!ep) return;
            const now = Date.now();
            if (now - lastSave.current > 5000) {
              lastSave.current = now;
              post("/api/progress", { id: ep.id, pos: audio.currentTime || 0, done: false }).catch(() => {});
            }
          }
          function onMeta() {
            setDur(audio.duration || 0);
            const ep = current;
            if (ep && ep.progress && ep.progress.pos && !ep.progress.done) {
              audio.currentTime = Math.min(ep.progress.pos, Math.max(0, (audio.duration || 0) - 5));
            }
            audio.playbackRate = speed;
          }
          function onEnded() {
            setPlaying(false);
            const ep = current;
            if (ep) post("/api/progress", { id: ep.id, pos: audio.duration || 0, done: true }).catch(() => {});
          }
          audio.addEventListener("timeupdate", onTime);
          audio.addEventListener("loadedmetadata", onMeta);
          audio.addEventListener("ended", onEnded);
          return () => {
            audio.removeEventListener("timeupdate", onTime);
            audio.removeEventListener("loadedmetadata", onMeta);
            audio.removeEventListener("ended", onEnded);
          };
        }, [current, speed]);

        const feeds = (state && state.feeds) || [];
        const episodes = useMemo(() => {
          const list = [];
          for (const feed of feeds) {
            if (activeFeed !== "all" && feed.id !== activeFeed) continue;
            for (const ep of feed.episodes) list.push({ ...ep, feedTitle: feed.title });
          }
          list.sort((a, b) => String(b.pub).localeCompare(String(a.pub)));
          return list.slice(0, 300);
        }, [feeds, activeFeed]);

        async function addFeed() {
          const url = feedUrl.trim();
          if (!url) return;
          setBusy(true);
          setError("");
          try {
            const next = await post("/api/feeds", { url });
            setState(next);
            setFeedUrl("");
          } catch (err) {
            setError("订阅失败：" + String(err.message || err));
          } finally {
            setBusy(false);
          }
        }

        async function removeFeed(id) {
          try {
            const next = await post("/api/feeds/remove", { id });
            setState(next);
            if (activeFeed === id) setActiveFeed("all");
          } catch (err) {
            setError(String(err.message || err));
          }
        }

        async function refresh() {
          setBusy(true);
          setError("");
          try {
            const next = await post("/api/feeds/refresh", {});
            setState({ feeds: next.feeds, settings: next.settings, qqGroup: next.qqGroup });
            if (next.errors && next.errors.length) setError(next.errors.map((e) => e.title + "：" + e.error).join("；"));
          } catch (err) {
            setError("刷新失败：" + String(err.message || err));
          } finally {
            setBusy(false);
          }
        }

        function play(ep) {
          const audio = audioRef.current;
          setCurrent(ep);
          setSummary(null);
          setDur(ep.duration || 0);
          setPos(ep.progress && ep.progress.pos ? ep.progress.pos : 0);
          if (!audio) return;
          audio.src = ep.audioProxy;
          audio.playbackRate = speed;
          const promise = audio.play();
          if (promise && promise.catch) promise.catch(() => setPlaying(false));
          setPlaying(true);
        }

        function toggle() {
          const audio = audioRef.current;
          if (!audio || !current) return;
          if (audio.paused) {
            audio.play().then(() => setPlaying(true)).catch((err) => setError(String(err.message || err)));
          } else {
            audio.pause();
            setPlaying(false);
          }
        }

        function seek(delta) {
          const audio = audioRef.current;
          if (!audio) return;
          audio.currentTime = Math.max(0, Math.min((audio.duration || dur || 0) - 1, (audio.currentTime || 0) + delta));
        }

        function scrub(value) {
          const audio = audioRef.current;
          if (!audio) return;
          audio.currentTime = value;
          setPos(value);
        }

        function changeSpeed(value) {
          setSpeed(value);
          const audio = audioRef.current;
          if (audio) audio.playbackRate = value;
          post("/api/settings", { speed: value }).catch(() => {});
        }

        async function showSummary() {
          if (!current) return;
          try {
            const data = await api("/api/summary?id=" + encodeURIComponent(current.id));
            setSummary(data);
          } catch (err) {
            setError(String(err.message || err));
          }
        }

        return h(
          "div",
          { style: { display: "flex", flexDirection: "column", height: "100%", minHeight: 0, color: "inherit" } },

          // header
          h(
            "div",
            { style: { padding: "14px 16px 10px", borderBottom: "1px solid " + C.border } },
            h(
              "div",
              { style: { display: "flex", alignItems: "center", gap: 8 } },
              h("div", { style: { fontSize: 17, fontWeight: 700 } }, "播客"),
              h(Pill, null, "🐧 AI 学习群 " + GROUP_NO),
              h("span", { style: { flex: 1 } }),
              h(
                "button",
                { onClick: refresh, disabled: busy, style: { border: "1px solid " + C.border, background: "transparent", color: "inherit", borderRadius: 6, padding: "4px 8px", fontSize: 12, cursor: "pointer" } },
                busy ? "刷新中…" : "刷新"
              )
            ),
            h(
              "div",
              { style: { marginTop: 8, fontSize: 12, opacity: C.muted } },
              state && state.feeds.length
                ? state.feeds.length + " 个订阅 · 点一集开始听，进度自动记住"
                : "粘贴小宇宙 / RSS 链接，像本地播放器一样听播客"
            ),
            h(
              "div",
              { style: { display: "flex", gap: 8, marginTop: 10 } },
              h("input", {
                value: feedUrl,
                onChange: (e) => setFeedUrl(e.target.value),
                onKeyDown: (e) => {
                  if (e.key === "Enter") addFeed();
                },
                placeholder: "https://… 播客 RSS 或小宇宙分享链接",
                style: { flex: 1, padding: "7px 10px", borderRadius: 6, border: "1px solid " + C.border, background: "transparent", color: "inherit", fontSize: 12, outline: "none" },
              }),
              h(
                "button",
                { onClick: addFeed, disabled: busy, style: { padding: "7px 12px", borderRadius: 6, border: "none", background: C.accent, color: "#fff", fontSize: 12, cursor: "pointer" } },
                "订阅"
              )
            ),
            error
              ? h("div", { style: { marginTop: 8, fontSize: 12, color: "#e5484d", whiteSpace: "pre-wrap" } }, error)
              : null
          ),

          // feed tabs
          feeds.length
            ? h(
                "div",
                { style: { display: "flex", gap: 6, padding: "8px 12px", overflowX: "auto", borderBottom: "1px solid " + C.border } },
                h(
                  "button",
                  {
                    onClick: () => setActiveFeed("all"),
                    style: { border: "1px solid " + (activeFeed === "all" ? C.accent : C.border), background: activeFeed === "all" ? "rgba(86,134,254,0.12)" : "transparent", color: "inherit", borderRadius: 999, padding: "3px 10px", fontSize: 12, cursor: "pointer", whiteSpace: "nowrap" },
                  },
                  "全部"
                ),
                ...feeds.map((feed) =>
                  h(
                    "span",
                    { key: feed.id, style: { display: "inline-flex", alignItems: "center", whiteSpace: "nowrap" } },
                    h(
                      "button",
                      {
                        onClick: () => setActiveFeed(feed.id),
                        title: feed.url,
                        style: { border: "1px solid " + (activeFeed === feed.id ? C.accent : C.border), background: activeFeed === feed.id ? "rgba(86,134,254,0.12)" : "transparent", color: "inherit", borderRadius: 999, padding: "3px 10px", fontSize: 12, cursor: "pointer", maxWidth: 180, overflow: "hidden", textOverflow: "ellipsis" },
                      },
                      feed.title
                    ),
                    h(
                      "button",
                      { onClick: () => removeFeed(feed.id), title: "取消订阅", style: { border: "none", background: "transparent", color: "inherit", opacity: 0.4, cursor: "pointer", fontSize: 12, padding: "0 2px" } },
                      "×"
                    )
                  )
                )
              )
            : null,

          // episodes
          h(
            "div",
            { style: { flex: 1, minHeight: 0, overflowY: "auto" } },
            episodes.length
              ? episodes.map((ep) =>
                  h(EpisodeRow, {
                    key: ep.id,
                    ep,
                    active: current && current.id === ep.id,
                    onPlay: play,
                  })
                )
              : h(
                  "div",
                  { style: { padding: 24, fontSize: 13, opacity: C.muted, lineHeight: 1.8 } },
                  "还没有节目。",
                  h("br", null),
                  "先订阅一个：小宇宙 → 节目页 → 分享 → 复制链接（RSS 也支持）。"
                )
          ),

          summary ? h(SummaryCard, { data: summary }) : null,

          current
            ? h(Player, {
                ep: current,
                playing,
                pos,
                dur,
                speed,
                onToggle: toggle,
                onSeek: seek,
                onScrub: scrub,
                onSpeed: changeSpeed,
                onSummary: showSummary,
              })
            : null,

          h("audio", { ref: audioRef, preload: "metadata", style: { display: "none" } })
        );
      }

      class Boundary extends React.Component {
        constructor(props) {
          super(props);
          this.state = { failed: false };
        }
        static getDerivedStateFromError() {
          return { failed: true };
        }
        componentDidCatch() {}
        render() {
          if (this.state.failed) return null;
          return this.props.children;
        }
      }

      function SideIcon() {
        return h(
          "div",
          { style: { display: "flex", alignItems: "center", gap: 6, padding: "6px 2px", fontSize: 12, cursor: "pointer" }, title: "播客：订阅、倍速、记住进度" },
          h("span", { style: { fontSize: 17 } }, "🎧")
        );
      }

      const inject = ["slots", "locale"];

      function apply(ctx) {
        function mount(name, registration, component) {
          if (!ctx.slots || typeof ctx.slots.inject !== "function") return;
          ctx.effect(function () {
            const dispose = ctx.slots.inject(name, function () {
              return ctx.slots.register(registration, component);
            });
            return function () {
              if (typeof dispose === "function") dispose();
            };
          }, "dsh-podcast-panel: " + name);
        }

        mount("sidebar.panellist", { name: "sidebar.panellist", id: "podcast", order: 21, label: function () { return "播客"; } }, SideIcon);
        mount("main", { name: "main", key: "podcast" }, function () {
          return h(Boundary, null, h(PodcastPanel, null));
        });
      }

      exports.inject = inject;
      exports.apply = apply;
      return module.exports;
    },
  });
})(typeof window !== "undefined" ? window : typeof self !== "undefined" ? self : null);
