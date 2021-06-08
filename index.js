import * as webpackModules from '@goosemod/webpack';
import * as patcher from '@goosemod/patcher';

// Webpacks

const Dispatcher      = webpackModules.findByProps("dispatch");
const getAllChannels  = webpackModules.findByProps("getMutableGuildChannels").getMutableGuildChannels;
const currentUser     = webpackModules.findByProps("getCurrentUser").getCurrentUser();
const checkPermission = webpackModules.findByProps("computePermissions").can;
const { getChannel }  = webpackModules.findByProps("getChannel");
const { getGuilds }   = webpackModules.findByProps("getGuilds");
const { Permissions, ChannelTypes } = webpackModules.findByProps("Permissions","ChannelTypes");

// Webpacks to be patched

const getDefaultChannel = webpackModules.findByProps("getDefaultChannel");
const getCategories     = webpackModules.findByProps("getCategories", "initialize");
const unreadManager     = webpackModules.findByProps("hasUnread").__proto__;
const fetchMessages     = webpackModules.findByProps("fetchMessages");
const originalFetch     = Object.assign({}, fetchMessages).fetchMessages;

// Helper functions

const appendHiddenChannelNotice = () => {
	const messagesWrapper = document.querySelector(`.${webpackModules.findByProps("messagesWrapper").messagesWrapper}`);
	if (!messagesWrapper) return;

	messagesWrapper.firstChild.style.display = "none";
    messagesWrapper.firstChild.nextSibling.style.display = "none";
	messagesWrapper.parentElement.children[1].style.display = "none";
	messagesWrapper.parentElement.parentElement.children[1].style.display = "none";

	const toolbar = document.querySelector(`.${webpackModules.findByProps("toolbar", "selected").toolbar}`);

	toolbar.style.display = "none";

	const newMessage = document.createElement("div");
    if(!newMessage) return;
	const txt = webpackModules.findByProps("h5");
	const flex = webpackModules.findByProps("flex");

	newMessage.className = flex.flexCenter;
	newMessage.style.width = "100%";

	newMessage.innerHTML = `
        <div class="${flex.flex} ${flex.directionColumn} ${flex.alignCenter}">
        <h2 class="${txt.h2} ${txt.defaultColor}">This is a hidden channel.</h2>
        <h5 class="${txt.h5} ${txt.defaultColor}">You cannot see the contents of this channel. However, you may see its name and topic.</h5>
        </div>`;

	messagesWrapper.appendChild(newMessage);
}

const handleChannelChange = data => {
	if (data.type !== "CHANNEL_SELECT" || !data.channelId) return;
	if (!isChannelVisible(data.channelId)) setTimeout(appendHiddenChannelNotice);
}

const isChannelVisible = channelId => {
    const channel = getChannel(channelId);
    if([ChannelTypes.DM].includes(channel?.type)) return true;
    return [ChannelTypes.GUILD_TEXT, ChannelTypes.GUILD_VOICE, ChannelTypes.STAGE_VOICE, ChannelTypes.GUILD_ANNOUNCEMENTS].includes(channel?.type) && checkPermission(Permissions.VIEW_CHANNEL, currentUser, channel);
}

const hiddenChannelCache = Object.values(getGuilds()).reduce((cache, currentGuild) => { 
    cache[currentGuild.id] = {
        channels: getDefaultChannel.getChannels(currentGuild.id).count,
        hiddenChannels: []
    };
    return cache;
}, {});

let caching = false;
const cacheHiddenChannels = () => {
    caching = true;
    const fetchedChannels = Object.values(getAllChannels());
    fetchedChannels.forEach(channel => {
        if (channel.type !== ChannelTypes.GUILD_CATEGORY && !isChannelVisible(channel.id))
            hiddenChannelCache[channel.guild_id].hiddenChannels.push(channel);
    });
    caching = false;
}

// Unpatchers

const Unpatch = {}

export default {
	goosemodHandlers: {
		onImport: async () => {
            cacheHiddenChannels();
            Dispatcher.subscribe("CHANNEL_SELECT", handleChannelChange);

            Unpatch.getDefaultChannel = patcher.patch(getDefaultChannel, "getChannels", (originalArgs, previousReturn) => {
                // originalArgs[0] is the channel id
                if(!originalArgs[0]) return previousReturn;


                if(hiddenChannelCache[originalArgs[0]].channels != previousReturn.count && !caching) {
                    caching = true;
                    hiddenChannelCache[originalArgs[0]] = {
                        channels: getDefaultChannel.getChannels(originalArgs[0]).count,
                        hiddenChannels: []
                    };
                    previousReturn.SELECTABLE.concat(previousReturn.VOICE).forEach(channel => {
                        if (!isChannelVisible(channel?.id))
                            hiddenChannelCache[originalArgs[0]].hiddenChannels.push(channel);
                    });
                    caching = false;
                }

                return previousReturn;
            });

            Unpatch.getCategories = patcher.patch(getCategories, "getCategories", (originalArgs, previousReturn) => {
                // originalArgs[0] is the channel id
                hiddenChannelCache[originalArgs[0]].hiddenChannels.forEach(channel => {
                    if(!channel) return;
                    const result = previousReturn[channel.parent_id || "null"].filter((item) => item.channel.id === channel.id );
					if (result.length) return;
					previousReturn[channel.parent_id || "null"].push({ channel: channel, index: 0 });
                });

                return previousReturn;
            });

            Unpatch.hasUnread = patcher.patch(unreadManager, "hasUnread", (originalArgs) => {
                // originalArgs[0] is the channel id
                if(!isChannelVisible(originalArgs[0])) originalArgs[0] = "";
                return originalArgs;
            }, true);

            Unpatch.hasUnreadPins = patcher.patch(unreadManager, "hasUnreadPins", (originalArgs) => {
                // originalArgs[0] is the channel id
                if(!isChannelVisible(originalArgs[0])) return ["unread"];
                return originalArgs;
            }, true);

            fetchMessages.fetchMessages = (originalArgs) => {
                if(!isChannelVisible(originalArgs.channelId)) return;
                return originalFetch(originalArgs);
            }

            Unpatch.fetchMessages = () => {
                fetchMessages.fetchMessages = originalFetch;
            }
		},

		onRemove: async () => {
            Dispatcher.unsubscribe("CHANNEL_SELECT", handleChannelChange);
            Object.values(Unpatch).forEach(unpatch => unpatch());
		},
	}
};