// dsh-system-control — 浏览器半（client half）
// 以 dsh web 的模块加载器格式打包（window.__ModuleLoader__.load），
// 在侧边栏底部 sidebar.footer.action 注册「系统」按钮（样式对齐官方设置触发器）：
//   点击 -> 页面中央弹出模态框，可选「重启服务」（appExit 42）或「关闭服务」（appExit 0，二次确认）
//   模态框内两个操作为一行两按钮：左「重启服务」、右「关闭服务」；
//   hover 由注入的 CSS :hover 实时计算（与官方设置模态一致），避免 JS enter/leave 状态残留
window.__ModuleLoader__.load({
	id: "dsh-system-control",
	factory: (require) => {
		var module = { exports: {} };
		var exports = module.exports;
		Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
		let react = require("react");

		// 注入轻量样式表：模态框操作按钮的基础样式与 :hover 走 CSS，
		// 由浏览器按实时命中测试计算（与官方设置模态一致），
		// 避免 JS onMouseEnter/onMouseLeave 状态在按钮间移动时残留。
		if (typeof document !== "undefined" && document.querySelector("style[data-plugin-css=" + JSON.stringify("dsh-system-control/ui.css") + "]") === null) {
			const tag = document.createElement("style");
			tag.dataset.plugin = "dsh-system-control";
			tag.dataset.pluginCss = "dsh-system-control/ui.css";
			tag.textContent = ".sysctl-opt{box-sizing:border-box;flex:1 1 0;min-width:0;height:44px;cursor:pointer;text-align:left;color:var(--dsw-alias-label-primary);background:transparent;border:none;border-radius:10px;align-items:center;gap:10px;padding:0 12px;font-family:inherit;font-size:14px;line-height:22px;display:flex}.sysctl-opt:hover{background:var(--dsw-alias-interactive-bg-hover)}";
			document.head.appendChild(tag);
		}

		const inject = ["slots", "connection"];

		const T = {
			labelPrimary: "var(--dsw-alias-label-primary)",
			labelSecondary: "var(--dsw-alias-label-secondary)",
			interactiveHover: "var(--dsw-alias-interactive-bg-hover)",
			bgLayer2: "var(--dsw-alias-bg-layer-2)",
			bgMask: "var(--dsw-alias-bg-mask-1)",
			maskBlur: "var(--dsw-mask-blur)",
			borderL2: "var(--dsw-alias-border-l2)",
			shadow: "var(--dsw-shadow-lv3)",
			error: "var(--dsw-alias-state-error-primary)",
			success: "var(--dsw-alias-state-success-primary)",
		};

		const POWER_PATH = "M13 3h-2v10h2V3zm4.83 2.17l-1.42 1.42C17.99 7.86 19 9.81 19 12c0 3.87-3.13 7-7 7s-7-3.13-7-7c0-2.19 1.01-4.14 2.58-5.41L6.17 5.17C4.23 6.82 3 9.26 3 12c0 4.97 4.03 9 9 9s9-4.03 9-9c0-2.74-1.23-5.18-3.17-6.83z";
		const REFRESH_PATH = "M17.65 6.35C16.2 4.9 14.21 4 12 4c-4.42 0-7.99 3.58-7.99 8s3.57 8 7.99 8c3.73 0 6.84-2.55 7.73-6h-2.08c-.82 2.33-3.04 4-5.65 4-3.31 0-6-2.69-6-6s2.69-6 6-6c1.66 0 3.14.69 4.22 1.78L13 11h7V4l-2.35 2.35z";

		function apply(ctx) {
			const slots = ctx.get("slots");
			const connection = ctx.get("connection");
			const timer = ctx.get("timer");
			if (slots === undefined || connection === undefined) return;

			const request = async (action) => {
				return await connection.rpc.call("/system", action, {});
			};

			function SystemControl(props) {
				const wide = props.wide !== false;
				const [open, setOpen] = react.useState(false);
				const [confirming, setConfirming] = react.useState(false);
				const [busy, setBusy] = react.useState(null);
				const [notice, setNotice] = react.useState(null);
				const [exitOk, setExitOk] = react.useState(null);
				const [hovered, setHovered] = react.useState(false);

				react.useEffect(() => {
					request("status").then((r) => {
						setExitOk(!!(r && r.ok === true && r.value && r.value.exitAvailable));
					}).catch(() => setExitOk(false));
				}, []);

				const close = () => { setOpen(false); setConfirming(false); setNotice(null); };

				const run = async (action) => {
					if (busy) return;
					setBusy(action);
					setNotice(null);
					try {
						const result = await request(action);
						if (result && result.ok === true) {
							setNotice(action === "restart" ? "正在重启…" : "正在关闭…");
							setOpen(false);
						} else {
							setNotice(result && result.error ? String(result.error.message || result.error) : "调用失败");
						}
					} catch (err) {
						setNotice("调用失败: " + String(err && err.message ? err.message : err));
					}
					setBusy(null);
				};

				const onShutdown = () => {
					if (confirming) {
						run("shutdown");
					} else {
						setConfirming(true);
						if (timer) timer.timeout(() => setConfirming(false), 4000);
					}
				};

				// ── 触发器：镜像官方设置按钮（宽栏全宽条 / 窄栏圆形）──
				const trigger = {
					boxSizing: "border-box", cursor: "pointer",
					color: T.labelPrimary, background: "transparent", border: "none",
					borderRadius: wide ? 12 : "50%",
					flex: "none", alignItems: "center", gap: wide ? 8 : 0,
					fontFamily: "inherit", fontSize: 14, lineHeight: 22,
					display: "flex", overflow: "hidden",
					justifyContent: wide ? "flex-start" : "center",
				};
				const triggerShape = wide
					? { width: "calc(100% + 8px)", height: 34, margin: "4px -4px", padding: "6px 2px 6px 10px" }
					: { width: 36, height: 36, margin: "8px 0 10px", padding: 0 };

				const button = react.createElement("button", {
					type: "button",
					style: Object.assign({}, trigger, triggerShape, hovered ? { background: T.interactiveHover } : null),
					"aria-label": "系统",
					title: "系统",
					onMouseEnter: () => setHovered(true),
					onMouseLeave: () => setHovered(false),
					onClick: () => { setOpen(true); setConfirming(false); setNotice(null); },
					onKeyDown: (e) => { if (e.key === "Escape") setOpen(false); },
				},
					react.createElement("svg", {
						viewBox: "0 0 24 24",
						width: wide ? 16 : 18,
						height: wide ? 16 : 18,
						"aria-hidden": true,
						style: { fill: "currentColor", flex: "none" },
					},
						react.createElement("path", { d: POWER_PATH }),
					),
					wide ? react.createElement("span", { style: { whiteSpace: "nowrap", overflow: "hidden" } }, "系统") : null,
				);

				// ── 中央模态框：面板自居中（fixed + transform），脱离父布局，杜绝尺寸异常与滚动条 ──
				// 两个操作为一行两按钮（左「重启服务」/ 右「关闭服务」），
				// 基础样式与 :hover 由注入的 .sysctl-opt 提供。
				const optLabel = {
					whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
				};
				const optRow = react.createElement("div", {
					style: { display: "flex", gap: 6 },
				},
					react.createElement("button", {
						type: "button",
						className: "sysctl-opt",
						onClick: () => run("restart"),
					},
						react.createElement("svg", { viewBox: "0 0 24 24", width: 18, height: 18, "aria-hidden": true, style: { fill: "currentColor", flex: "none" } },
							react.createElement("path", { d: REFRESH_PATH }),
						),
						react.createElement("span", { style: optLabel }, busy === "restart" ? "正在重启…" : "重启服务"),
					),
					react.createElement("button", {
						type: "button",
						className: "sysctl-opt",
						style: { color: T.error },
						onClick: onShutdown,
					},
						react.createElement("svg", { viewBox: "0 0 24 24", width: 18, height: 18, "aria-hidden": true, style: { fill: "currentColor", flex: "none" } },
							react.createElement("path", { d: POWER_PATH }),
						),
						react.createElement("span", { style: optLabel }, confirming ? "确认关闭" : busy === "shutdown" ? "正在关闭…" : "关闭服务"),
					),
				);

				const modal = open ? react.createElement("div", {
					style: { position: "fixed", inset: 0, zIndex: 1200 },
				},
					react.createElement("div", {
						style: {
							position: "absolute", inset: 0,
							background: T.bgMask, backdropFilter: T.maskBlur,
						},
						onClick: close,
					}),
					react.createElement("div", {
						role: "dialog",
						"aria-label": "系统控制",
						style: {
							position: "fixed",
							top: "50%", left: "50%",
							transform: "translate(-50%, -50%)",
							boxSizing: "border-box",
							background: T.bgLayer2,
							width: 360, maxWidth: "calc(100vw - 48px)",
							borderRadius: 20, boxShadow: T.shadow,
							padding: "20px 20px 16px",
						},
					},
						react.createElement("div", {
							style: {
								display: "flex", alignItems: "flex-start",
								justifyContent: "space-between", gap: 8,
							},
						},
							react.createElement("div", null,
								react.createElement("div", { style: { fontSize: 16, fontWeight: 500, lineHeight: "24px", color: T.labelPrimary } }, "系统控制"),
								react.createElement("div", {
									style: {
										fontSize: 12, lineHeight: "18px", marginTop: 2,
										color: exitOk === null ? T.labelSecondary : (exitOk ? T.success : T.error),
									},
								}, exitOk === null ? "正在检查退出通道…" : (exitOk ? "退出通道：可用" : "退出通道：不可用")),
							),
							react.createElement("button", {
								type: "button",
								"aria-label": "关闭",
								style: {
									flex: "none", cursor: "pointer", width: 28, height: 28,
									color: T.labelSecondary, background: "transparent",
									border: "none", borderRadius: 28,
									display: "inline-flex", alignItems: "center", justifyContent: "center",
									fontSize: 18, lineHeight: 1,
								},
								onClick: close,
							}, react.createElement("span", null, "×")),
						),
						react.createElement("div", { style: { height: 14 } }),
						optRow,
						notice ? react.createElement("div", {
							style: {
								marginTop: 12, padding: "8px 10px", fontSize: 12, lineHeight: "18px",
								color: T.labelSecondary, borderTop: "1px solid " + T.borderL2,
							},
						}, notice) : null,
						react.createElement("button", {
							type: "button",
							style: {
								marginTop: 12, width: "100%", height: 36, cursor: "pointer",
								color: T.labelSecondary, background: "transparent",
								border: "none", borderRadius: 10,
								fontFamily: "inherit", fontSize: 13, lineHeight: "18px",
								display: "flex", alignItems: "center", justifyContent: "center",
							},
							onClick: close,
						}, "取消"),
					),
				) : null;

				const wrapper = {
					position: "relative",
					display: "flex",
					width: wide ? "100%" : "auto",
					minWidth: 0,
				};
				return react.createElement("div", { style: wrapper }, button, modal);
			}

			slots.inject("sidebar.footer.action", () => slots.register(
				{ name: "sidebar.footer.action", id: "system-control", order: 20, label: () => "系统" },
				(props) => react.createElement(SystemControl, props),
			));
		}

		exports.apply = apply;
		exports.inject = inject;
		return module.exports;
	}
});
