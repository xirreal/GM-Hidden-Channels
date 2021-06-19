import * as webpackModules from '@goosemod/webpack';
import * as patcher from '@goosemod/patcher';

// Webpacks

const Dispatcher      = webpackModules.findByProps("dispatch");
const getAllChannels  = webpackModules.findByProps("getMutableGuildChannels").getMutableGuildChannels;
const currentUser     = webpackModules.findByProps("getCurrentUser").getCurrentUser();
const checkPermission = webpackModules.findByProps("computePermissions").can;
const ChannelItem = webpackModules.find(m => m?.default?.displayName === 'ChannelItem');
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
    if(messagesWrapper.firstChild.nextSibling) messagesWrapper.firstChild.nextSibling.style.display = "none";
	messagesWrapper.parentElement.children[1].style.display = "none";
	messagesWrapper.parentElement.parentElement.children[1].style.display = "none";

	const toolbar = document.querySelector(`.${webpackModules.findByProps("toolbar", "selected").toolbar}`);

	toolbar.style.display = "none";

	const newMessage = document.createElement("div");
	const txt = webpackModules.findByProps("h5");
	const flex = webpackModules.findByProps("flex");

    try {
        newMessage.className = flex.flexCenter;
        newMessage.style.width = "100%";

        newMessage.innerHTML = `
            <div class="${flex.flex} ${flex.directionColumn} ${flex.alignCenter}">
            <h2 class="${txt.h2} ${txt.defaultColor}">This is a hidden channel.</h2>
            <h5 class="${txt.h5} ${txt.defaultColor}">You cannot see the contents of this channel. However, you may see its name and topic.</h5>
            </div>`;

        messagesWrapper.appendChild(newMessage);
    }
    catch (e) {};
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
const cssHeader = document.createElement('style');
cssHeader.id = 'hidden-channels-css';
cssHeader.textContent = `[aria-label$="hidden"] > div > svg > path[d="M21.025 5V4C21.025 2.88 20.05 2 19 2C17.95 2 17 2.88 17 4V5C16.4477 5 16 5.44772 16 6V9C16 9.55228 16.4477 10 17 10H19H21C21.5523 10 22 9.55228 22 9V5.975C22 5.43652 21.5635 5 21.025 5ZM20 5H18V4C18 3.42857 18.4667 3 19 3C19.5333 3 20 3.42857 20 4V5Z"],
[aria-label$="hidden"] > div > svg > path[d="M17 11V7C17 4.243 14.756 2 12 2C9.242 2 7 4.243 7 7V11C5.897 11 5 11.896 5 13V20C5 21.103 5.897 22 7 22H17C18.103 22 19 21.103 19 20V13C19 11.896 18.103 11 17 11ZM12 18C11.172 18 10.5 17.328 10.5 16.5C10.5 15.672 11.172 15 12 15C12.828 15 13.5 15.672 13.5 16.5C13.5 17.328 12.828 18 12 18ZM15 11H9V7C9 5.346 10.346 4 12 4C13.654 4 15 5.346 15 7V11Z"] {
    fill:hsl(359, calc(var(--saturation-factor, 1) * 82.6%), 59.4%) !important;
}`;

export default {
	goosemodHandlers: {
		onImport: async () => {
            cacheHiddenChannels();
            Dispatcher.subscribe("CHANNEL_SELECT", handleChannelChange);

            document.head.appendChild(cssHeader);

            Unpatch.CSS = () => {
                cssHeader.remove();
            }

            Unpatch.getDefaultChannel = patcher.patch(getDefaultChannel, "getChannels", (originalArgs, previousReturn) => {
                // originalArgs[0] is the channel id
                if(!originalArgs[0]) return previousReturn;

                if(hiddenChannelCache[originalArgs[0]]?.channels != previousReturn.count && !caching) {
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

            Unpatch.ChannelItem = patcher.patch(ChannelItem, "default", (originalArgs) => {
                // originalArgs[0] are the props
                if(!isChannelVisible(originalArgs[0].channel.id)) originalArgs[0]["aria-label"] += " hidden";
                return originalArgs;
            }, true);

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