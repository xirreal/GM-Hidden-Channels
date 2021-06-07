import * as webpackModules from '@goosemod/webpack';

function suppressErrors(method, description) {
	return (...params) => {
		try {
			return method(...params);
		} catch (e) {
			console.error('Error occurred in ' + description, e);
		}
	};
}

function monkeyPatch(what, methodName, options) {
	if (typeof options === 'function') {
		const newOptions = { instead: options, silent: true };
		options = newOptions;
	}
	const { before, after, instead, once = false, silent = false, force = false } = options;
	const displayName = options.displayName || what.displayName || what.name || what.constructor ? (what.constructor.displayName || what.constructor.name) : null;
	if (!silent) console.log(`%c[ED_MonkeyPatch] %c[Modules]`, 'color: red;', `color: black;`, `Patched ${methodName} in module ${displayName || '<unknown>'}:`, what); // eslint-disable-line no-console
	if (!what[methodName]) {
		if (force) what[methodName] = function () {};
		else return console.warn(`%c[ED_MonkeyPatch] %c[Modules]`, 'color: red;', `color: black;`, `Method ${methodName} doesn't exist in module ${displayName || '<unknown>'}`, what); // eslint-disable-line no-console
	}
	const origMethod = what[methodName];
	const cancel = () => {
		if (!silent) console.log(`%c[ED_MonkeyPatch] %c[Modules]`, 'color: red;', `color: black;`, `Unpatched ${methodName} in module ${displayName || '<unknown>'}:`, what); // eslint-disable-line no-console
		what[methodName] = origMethod;
	};
	what[methodName] = function () {
		const data = {
			thisObject: this,
			methodArguments: arguments,
			cancelPatch: cancel,
			originalMethod: origMethod,
			callOriginalMethod: () => data.returnValue = data.originalMethod.apply(data.thisObject, data.methodArguments)
		};
		if (instead) {
			const tempRet = suppressErrors(instead, '`instead` callback of ' + what[methodName].displayName)(data);
			if (tempRet !== undefined) data.returnValue = tempRet;
		} else {
			if (before) suppressErrors(before, '`before` callback of ' + what[methodName].displayName)(data);
			data.callOriginalMethod();
			if (after) suppressErrors(after, '`after` callback of ' + what[methodName].displayName)(data);
		}
		if (once) cancel();
		return data.returnValue;
	};
	what[methodName].__monkeyPatched = true;
	what[methodName].displayName = 'patched ' + (what[methodName].displayName || methodName);
	what[methodName].unpatch = cancel;
	return cancel;
}

function dispatchSubscription(data) {
	if (data.type !== "CHANNEL_SELECT") return;

	if (getChannel(data.channelId) && getChannel(data.channelId).isHidden()) {
		setTimeout(attachHiddenChanNotice);
	}
}

function attachHiddenChanNotice() {
	const messagesWrapper = document.querySelector(
		`.${webpackModules.findByProps("messagesWrapper").messagesWrapper}`
	);
	if (!messagesWrapper) return;

	messagesWrapper.firstChild.style.display = "none"; // Remove messages shit.
	messagesWrapper.parentElement.children[1].style.display = "none"; // Remove message box.
	messagesWrapper.parentElement.parentElement.children[1].style.display =
		"none"; // Remove user list.

	const toolbar = document.querySelector(
		"." +
		webpackModules.find((m) => {
			if (m instanceof Window) return;
			if (m.toolbar && m.selected) return m;
		}).toolbar
	);

	toolbar.style.display = "none";

	const hiddenChannelNotif = document.createElement("div");

	// Class name modules
	const txt = webpackModules.findByProps("h5");
	const flx = webpackModules.findByProps("flex");

	hiddenChannelNotif.className = flx.flexCenter;
	hiddenChannelNotif.style.width = "100%";

	hiddenChannelNotif.innerHTML = `
        <div class="${flx.flex} ${flx.directionColumn} ${flx.alignCenter}">
        <h2 class="${txt.h2} ${txt.defaultColor}">This is a hidden channel.</h2>
        <h5 class="${txt.h5} ${txt.defaultColor}">You cannot see the contents of this channel. However, you may see its name and topic.</h5>
        </div>`;

	messagesWrapper.appendChild(hiddenChannelNotif);

}
let getChannel,
	g_dc,
	g_cat,
	ha,
	disp,
	chanM,
	fm,
	reb,
	sv,
	cs,
	csp,
	ghp,
	gs,
	gsr,
	pf,
	sw = {},
	g = {},
	ai = {},
	_editingChannel,
	_editingGuild;

export default {
	goosemodHandlers: {
		onImport: async () => {
			console.log('Enabling hidden channels')
            disp = webpackModules.findByProps("dispatch");
			getChannel = webpackModules.findByProps("getChannel").getChannel;
			sw = webpackModules.findByProps("switchItem");
			g = webpackModules.find((m) => m.group && m.item);
			ai = webpackModules.findByProps("actionIcon");

			const getUser = webpackModules.findByProps("getCurrentUser").getCurrentUser;
			const getAllChannels = webpackModules.findByProps("getMutableGuildChannels")
				.getMutableGuildChannels;
			const can = webpackModules.findByProps("computePermissions").can;

			g_dc = webpackModules.findByProps("getDefaultChannel");
			monkeyPatch(g_dc, "getChannels", (b) => {
				const og = b.callOriginalMethod(b.methodArguments);
				if (!b.methodArguments[0]) return og;
				const hidden = [], allChans = getAllChannels();
				for (const i in allChans) {
					if (allChans[i].guild_id === b.methodArguments[0]) {
						if (allChans[i].type !== 4 && !can({data: BigInt(1024) }, getUser(), getChannel(allChans[i].id)))
							hidden.push(allChans[i]);
					}
				}
				og.HIDDEN = hidden;
				return og;
			});
			chanM = webpackModules.find((m) => m.prototype && m.prototype.isManaged);
			chanM.prototype.isHidden = function () {
				return (
					[0, 4, 5].includes(this.type) && !can({data: BigInt(1024) }, getUser(), this)
				);
			};

			g_cat = webpackModules.find((m) => m.getCategories && !m.EMOJI_NAME_RE);
			monkeyPatch(g_cat, "getCategories", (b) => {
				const og = b.callOriginalMethod(b.methodArguments);
				const chs = g_dc.getChannels(b.methodArguments[0]);
				chs.HIDDEN.forEach((c) => {
					const result = og[c.parent_id || "null"].filter(
						(item) => item.channel.id === c.id
					);
					if (result.length) return; // already added
					og[c.parent_id || "null"].push({
						channel: c,
						index: 0
					});
				});
				return og;
			});

			ha = webpackModules.findByProps("hasUnread").__proto__;
			monkeyPatch(ha, "hasUnread", function (b) {
				if (
					getChannel(b.methodArguments[0]) &&
					getChannel(b.methodArguments[0]).isHidden()
				)
					return false; // don't show hidden channels as unread.
				return b.callOriginalMethod(b.methodArguments);
			});
			monkeyPatch(ha, "hasUnreadPins", function (b) {
				if (
					getChannel(b.methodArguments[0]) &&
					getChannel(b.methodArguments[0]).isHidden()
				)
					return false; // don't show icon on hidden channel pins.
				return b.callOriginalMethod(b.methodArguments);
			});

			disp.subscribe("CHANNEL_SELECT", dispatchSubscription);

			fm = webpackModules.findByProps("fetchMessages");
			monkeyPatch(fm, "fetchMessages", function (b) {
				if (
					getChannel(b.methodArguments[0]) &&
					getChannel(b.methodArguments[0]).isHidden()
				)
					return;
				return b.callOriginalMethod(b.methodArguments);
			});

            // Unused cause perm view is broken

			// const clk = webpackModules.findByDisplayName("Clickable");
			// const Tooltip = webpackModules.findByProps("TooltipContainer")
			// 	.TooltipContainer;
			// const { Messages } = webpackModules.findByProps("Messages");
            // const Gear = webpackModules.findByDisplayName("Gear");

			// reb = webpackModules.find(
			// 	(m) =>
			// 	m.default && m.default.prototype && m.default.prototype.renderEditButton
			// ).default.prototype;
			// monkeyPatch(reb, "renderEditButton", function (b) {
			// 	return webpackModules.common.React.createElement(
			// 		Tooltip, {
			// 			text: Messages.EDIT_CHANNEL
			// 		},
			// 		webpackModules.common.React.createElement(
			// 			clk, {
			// 				className: ai.iconItem,
			// 				onClick: function () {
			// 					_editingGuild = null;
			// 					_editingChannel = b.thisObject.props.channel.id;
			// 					return b.thisObject.handleEditClick.apply(
			// 						b.thisObject,
			// 						arguments
			// 					);
			// 				},
			// 				onMouseEnter: b.thisObject.props.onMouseEnter,
			// 				onMouseLeave: b.thisObject.props.onMouseLeave,
			// 			},
			// 			webpackModules.common.React.createElement(Gear, {
			// 				width: 16,
			// 				height: 16,
			// 				className: ai.actionIcon,
			// 			})
			// 		)
			// 	);
			// });

			// sv = webpackModules.findByDisplayName("SettingsView").prototype;
			// monkeyPatch(sv, "getPredicateSections", {
			// 	before: (b) => {
            //         console.log(b.thisObject.props)
			// 		const permSect = b.thisObject.props.sections.find(
			// 			(item) => item.section === "PERMISSIONS"
			// 		);
			// 		if (permSect) {
            //             permSect.predicate = () => true;

            //         }
			// 	},
			// 	silent: true,
			// });

            // BROKEN in latest Discord Update, old module was removed

			// cs = webpackModules.findByDisplayName("????????????")
			// 	.prototype;
			// monkeyPatch(cs, "render", (b) => {
			// 	const egg = b.callOriginalMethod(b.methodArguments);
			// 	egg.props.canManageRoles = true;
			// 	return egg;
			// });

			// csp = webpackModules.findByDisplayName(
			// 	"FluxContainer(ChannelSettingsPermissions)"
			// ).prototype;
			// monkeyPatch(csp, "render", (b) => {
			// 	const egg = b.callOriginalMethod(b.methodArguments);
			// 	const chan = getChannel(egg.props.channel.id);
			// 	if (!chan || !chan.isHidden()) return egg;
			// 	egg.props.canSyncChannel = false;
			// 	egg.props.locked = true;
			// 	setTimeout(() => {
			// 		document
			// 			.querySelectorAll("." + g.group)
			// 			.forEach(
			// 				(elem) => (elem.style = "opacity: 0.5; pointer-events: none;")
			// 			);
			// 	});
			// 	return egg;
			// });

			// const cancan = webpackModules.findByProps("can").can;
			// // gsr = webpackModules.findByDisplayName("FluxContainer(GuildSettingsRoles)")
			// // 	.prototype;
			// // monkeyPatch(gsr, "render", (b) => {
			// // 	const egg = b.callOriginalMethod(b.methodArguments);
			// // 	const hasPerm = cancan({
			// // 		data: BigInt(268435456)
			// // 	}, {
			// // 		guildId: egg.props.guild.id
			// // 	});
			// // 	if (hasPerm) return;
			// // 	setTimeout(() => {
			// // 		document
			// // 			.querySelectorAll("." + sw.switchItem)
			// // 			.forEach((elem) => elem.classList.add(sw.disabled));
			// // 	});
			// // 	return egg;
			// // });

			// const getGuild = webpackModules.findByProps("getGuild").getGuild;
			// pf = webpackModules.findByDisplayName("PermissionsForm").prototype;
			// monkeyPatch(pf, "render", (b) => {
			// 	const egg = b.callOriginalMethod(b.methodArguments);
			// 	const guild = _editingGuild ?
			// 		getGuild(_editingGuild) :
			// 		null;
			// 	const channel = _editingChannel ?
			// 		getChannel(_editingChannel) :
			// 		null;
			// 	if (!guild && !channel) return egg;
			// 	const hasPerm = cancan({
			// 			"data": BigInt(268435456)
			// 		},
			// 		guild ? {
			// 			"guildId": guild.id
			// 		} : {
			// 			"channelId": channel.id
			// 		}
			// 	);
			// 	if (hasPerm) return egg;
			// 	if (!egg.props.children || !egg.props.children[1]) return egg;
			// 	egg.props.children[1].forEach((item) => {
			// 		item.disabled = true;
			// 		item.props.disabled = true;
			// 	});
			// 	return egg;
			// });
		},

		onLoadingFinished: async () => {
			console.log('Hidden channels enabled.')
		},

		onRemove: async () => {
			g_dc.getChannels.unpatch();
			g_cat.getCategories.unpatch();
			ha.hasUnread.unpatch();
			ha.hasUnreadPins.unpatch();
			fm.fetchMessages.unpatch();
			reb.renderEditButton.unpatch();

			for (const mod of [sv, cs, csp, ghp, gs, pf])
				if (mod && mod.render && mod.render.unpatch) mod.render.unpatch();

			disp.unsubscribe("CHANNEL_SELECT", dispatchSubscription);
		},
	}
};

/*
TODO: Better way to do stuff
goosemod.webpackModules.findByProps("computePermissions"), overwrite but store copy of the original to check actual permissions
goosemod.webpackModules.findByProps("has","hasAny","deserialize","getFlag"), this will be used for comparing permissions
{Permissions, ChannelTypes} = goosemod.webpackModules.findByProps("Permissions","ChannelTypes")
goosemod.webpackModules.findByProps("hasUnread"), overwrite to fix unreads
*/