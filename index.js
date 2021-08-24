import * as webpackModules from '@goosemod/webpack';
import * as patcher from '@goosemod/patcher';

// Webpacks

const getAllChannels  = webpackModules.findByProps("getMutableGuildChannels").getMutableGuildChannels;
const currentUser     = webpackModules.findByProps("getCurrentUser").getCurrentUser();
const checkPermission = webpackModules.findByProps("computePermissions").can;
const ChannelItem = webpackModules.find(m => m?.default?.displayName === 'ChannelItem');
const { getChannel }  = webpackModules.findByProps("getChannel");
const { getGuilds }   = webpackModules.findByProps("getGuilds");
const { Permissions, ChannelTypes } = webpackModules.findByProps("Permissions","ChannelTypes");
const FluxDispatcher = webpackModules.common.FluxDispatcher;

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
    if(!channel || !channelId || [ChannelTypes.DM, ChannelTypes.GROUP_DM].includes(channel?.type)) return true;
    return [ChannelTypes.GUILD_TEXT, ChannelTypes.GUILD_VOICE, ChannelTypes.GUILD_STAGE_VOICE, ChannelTypes.GUILD_ANNOUNCEMENT, ChannelTypes.ANNOUNCEMENT_THREAD, ChannelTypes.PRIVATE_THREAD, ChannelTypes.PUBLIC_THREAD].includes(channel?.type) && checkPermission(Permissions.VIEW_CHANNEL, currentUser, channel);
}

const hiddenChannelCache = Object.values(getGuilds()).reduce((cache, currentGuild) => { 
    cache[currentGuild.id] = {
        channels: getDefaultChannel.getChannels(currentGuild.id).count,
        hiddenChannels: []
    };
    return cache;
}, {});

const cacheHiddenChannels = () => {
    const fetchedChannels = Object.values(getAllChannels());
    fetchedChannels.forEach(channel => {
        if (channel.type !== ChannelTypes.GUILD_CATEGORY && !isChannelVisible(channel.id))
            hiddenChannelCache[channel.guild_id].hiddenChannels.push(channel);
    });
}

const cacheServerHiddenChannels = (guildId, newHiddenChannels) => {

    if(newHiddenChannels?.length > 0 && hiddenChannelCache[guildId]?.channels !== undefined) {
        hiddenChannelCache[guildId].hiddenChannels.concat(newHiddenChannels);
        return;
    }

    const channels = getDefaultChannel.getChannels(guildId);

    if(hiddenChannelCache[guildId]?.channels > 0 && hiddenChannelCache[guildId]?.channels == channels.count) return;

    hiddenChannelCache[guildId] = {
        channels: channels.count,
        hiddenChannels: []
    };

    channels.SELECTABLE.concat(channels.VOCAL).forEach(channel => {
        if (!isChannelVisible(channel?.id))
            hiddenChannelCache[guildId].hiddenChannels.push(channel);
    });

}

const handleGuildJoin = (event) => {
    cacheServerHiddenChannels(event.guild.id);
};

const handleGuildLeave = (event) => {
    delete hiddenChannelCache[event.guild.id];
}

const handleChannelUpdate = (event) => {
    cacheServerHiddenChannels(event?.updates?.[0]?.channel?.guild_id || event?.channel?.guild_id, event?.updates?.filter(x => !isChannelVisible(x.id)));
};

const handleChannelDelete = (event) => {
    const guildId = event.channel.guild_id;
    if(!hiddenChannelsCache[guildId]) return cacheServerHiddenChannels(guildId);

    hiddenChannelsCache[guildId].hiddenChannels.filter(channel => channel?.id != event.channel.id)
    hiddenChannelsCache[guildId].channels -= 1;
}


// Unpatchers

const Unpatch = {}

// CSS stuff

const cssHeader = document.createElement('style');
cssHeader.id = 'hidden-channels-css';
cssHeader.textContent = `[aria-label$="hidden"] > div path[d^="M2"][d*="19"], [aria-label$="hidden"] > div path[d^="M17"][d*="19"]{ fill: #ed4245 !important; }`;

export default {
    goosemodHandlers: {
        onImport: async () => {
            cacheHiddenChannels();

            document.head.appendChild(cssHeader);

            Unpatch.CSS = () => {
		        cssHeader.remove();
	        };

            Unpatch.guildCreate = () => {FluxDispatcher.unsubscribe("GUILD_CREATE", handleGuildJoin)};
            FluxDispatcher.subscribe("GUILD_CREATE", handleGuildJoin);

            Unpatch.guildDelete = () => {FluxDispatcher.unsubscribe("GUILD_DELETE", handleGuildLeave)};
            FluxDispatcher.subscribe("GUILD_DELETE", handleGuildLeave);

            Unpatch.channelUpdate = () => {FluxDispatcher.unsubscribe("CHANNEL_UPDATES", handleChannelUpdate)};
            FluxDispatcher.subscribe("CHANNEL_UPDATES", handleChannelUpdate);
            Unpatch.channelCreate = () => {FluxDispatcher.unsubscribe("CHANNEL_CREATE", handleChannelUpdate)};
            FluxDispatcher.subscribe("CHANNEL_CREATE", handleChannelUpdate);

            Unpatch.channelDelete = () => {FluxDispatcher.unsubscribe("CHANNEL_DELETE", handleChannelDelete)};
            FluxDispatcher.subscribe("CHANNEL_CREATE", handleChannelDelete);

            Unpatch.channelSelect = () => {FluxDispatcher.unsubscribe("CHANNEL_SELECT", handleChannelChange)};
            FluxDispatcher.subscribe("CHANNEL_SELECT", handleChannelChange);

            Unpatch.getCategories = patcher.patch(getCategories, "getCategories", (originalArgs, previousReturn) => {
                // originalArgs[0] is the channel id

                hiddenChannelCache[originalArgs[0]].hiddenChannels.forEach(channel => {
                    if(!channel) return previousReturn;
                    const channelsInCategory = previousReturn[channel.parent_id || "null"];
                    if (channelsInCategory.filter((item) => item?.channel?.id === channel.id).length) return previousReturn;
                    channelsInCategory.push({ channel: channel, index: 0 });
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

        onRemove: () => {
            Object.values(Unpatch).forEach(unpatch => unpatch());
        },
    }
};
