const { Events } = require('discord.js');
const { Keyv } = require('keyv');
const { KeyvSqlite } = require('@keyv/sqlite');

/**
 * Primary function triggered on message create events.
 * @param {Object} message - Discord API message object.
 * @returns Nothing.
 */
async function execute (message) {
    if (message.author.bot || message.author.system) return; // Ignore bot messages.
    // if (message.content === "") return; //  No longer ignore empty messages, attachments are tracked

    // Retrieve settings data
    const dbFile = new KeyvSqlite(`sqlite://DATA/${message.guild.id}-settings.sqlite`);
    const keyv = new Keyv(dbFile, { namespace: 'config' });

    const expiration = await keyv.get('ttl_seconds') || 120;
    const limit = await keyv.get('limit_count') || 2;
    const unban = await keyv.get('immediate_unban') || false;

    // Store this message in the database.
    const appended = await appendToDB(message, expiration);

    // console.log(appended);

    // Get all messages from the database.
    const retrieved = await pullNamespace(message.guild.id);
    // Count the instances of each message.
    const postCounts = await countCrossPosts(retrieved);
    // Filter out messages that appear less than the given limit.
    const crossPosts = await filterPostCounts(postCounts, limit);
    // Get the first user who cross-posted, if any.
    const crossPoster = await getFirstCrossPoster(retrieved, crossPosts);

    if (!crossPoster) return;
    // console.log(crossPoster);

    // Get the client
    const client = require('../../index');
    // Get the guild from client cache
    const guild = client.guilds.cache.get(message.guild.id);

    // Ban the user who cross-posted.
    banCrossPoster(crossPoster, guild);
    if (unban) {
        unbanCrossPoster(crossPoster, guild);
    }

    // Currently only message content and attachments are both tracked.
    // Attachment tracking works by ensuring all attachments are the same size across all messages.
    // If content differs but attachments are the same, the bot won't flag it.
    return;
}

/**
 * Simple function to append given message data to the database, with a ttl of 120 seconds.
 * @param {object} message - Message data object from Discord API
 * @returns true or false, depending on if the data was written.
 */
async function appendToDB (message, expiration) {
    const dbFile = new KeyvSqlite(`sqlite://DATA/${message.guild.id}-msgcache.sqlite`);
    const keyv = new Keyv(dbFile, { namespace: 'cache' });
    // keyv.clear(); // this erases all data in the namespace.
    const now = Date.now();
    const DataObj = {};
    DataObj["author"] = message.author.id;
    DataObj["channel"] = message.channel.id;
    DataObj["content"] = message.content;
    DataObj["attachments"] = message.attachments;
    DataObj["db_id"] = now;
    const set = await keyv.set(now, DataObj, expiration * 1000);
    return set;
}

/**
 * Get all data from the namespace.
 * @param {String} guildId - Identifier for the target guild's database. 
 * @returns object containing all data from the namespace, if any.
 */
async function pullNamespace (guildId) {
    const dbFile = new KeyvSqlite(`sqlite://DATA/${guildId}-msgcache.sqlite`);
    const keyv = new Keyv(dbFile, { namespace: 'cache' });
    const allData = {};
    let counter = 0;
    for await (const [key, value] of keyv.iterator()) {
        // console.log(key, value);
        allData[counter] = value;
        counter++;
    };
    return allData;
}

/**
 * Count the messages and how often they re-occur.
 * @param {Object} data - object of all messages stored in the database.
 * @returns An array of arrays, where each inner-array counts the instances of each message.
 */
async function countCrossPosts (data) {
    const keychain = Object.keys(data);
    const allCrossPosts = [];
    for (const key in keychain) {
        const value = data[key];
        // iterate through the rest, comparing them to this one
        // find any that are the SAME content && the SAME author, && DIFFERENT channel.
        // put them in a separate array.
        const crossPosts = [];
        crossPosts.push(key);
        for (const otherKey in keychain) {
            const otherValue = data[otherKey];
            if (value.content === otherValue.content && value.author === otherValue.author && value.channel !== otherValue.channel) {
                if (value.attachments.length > 0 && otherValue.attachments.length > 0) {
                    const valueSizes = getAllAttachmentSizes(value);
                    const otherSizes = getAllAttachmentSizes(otherValue);
                    if (valueSizes === otherSizes) {
                        crossPosts.push(otherKey);
                    }
                } else {
                    crossPosts.push(otherKey);
                }
            } else {
                // Debugging
                // console.log(`${otherKey} is not a cross-post.`);
            }
        }
        allCrossPosts.push(crossPosts);
    }
    console.log(allCrossPosts);
    return allCrossPosts;
}

/**
 * Filter for arrays indicating a message was been cross-posted.
 * @param {Array} arr - an array of arrays.
 * @param {Number} crossPostLimit - The number of times a message should be cross-posted before it's flagged.
 * @returns An array of arrays with a length > the given limit.
 */
async function filterPostCounts (arr, crossPostLimit) {
    let filteredArr = [];
    for (const item in arr) {
        // console.log(`Array #${item} is of length ${arr[item].length}...`);
        if (arr[item].length > crossPostLimit) {
            filteredArr.push(item);
        }
    }
    return filteredArr;
}

/**
 * Get the first message author found cross-posting. 
 * @param {Object} cache - All messages stored in the database.
 * @param {Array} crossPosts - An array of the numeric identifiers for each message in that database that re-occurs.
 * @returns The user ID of the first message author found in the likely cross-posts.
 */
async function getFirstCrossPoster (cache, crossPosts) {
    if (cache[crossPosts[0]] === undefined) return undefined;
    return cache[crossPosts[0]].author
}

/**
 * Ban the given user from the given guild object.
 * @param {String} crossPosterId - Discord user ID of the target to ban.
 * @param {Object} guildObj - Object of the guild in which the target is found cross-posting.
 */
async function banCrossPoster (crossPosterId, guildObj) {
    guildObj.members.ban(crossPosterId, { deleteMessageSeconds: 7 * 24 * 60 * 60, reason: "User flagged for cross-posting." } ).catch(err => {
        console.log(err);
    });
}

/**
 * Unban the given user from the given guild.
 * @param {String} crossPosterId - Discord user ID of the target to unban.
 * @param {Object} guildObj - Object of the guild in which the target is found cross-posting.
 */
async function unbanCrossPoster (crossPosterId, guildObj) {
    guildObj.members.unban(crossPosterId, { reason: "Immediate unban is enabled." } ).catch(err => {
        console.log(err);
    });
}

/**
 * Concatenate each attachment's size into a single string.
 * @param {*} msg - Message object
 * @returns concatenated string
 */
function getAllAttachmentSizes (msg) {
    let str = "";
    for (const attachment of msg.attachments) {
        str = str+`${attachment.size}`;
    }
    return str;
}

module.exports = { name: Events.MessageCreate, once: false, execute }