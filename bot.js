require("dotenv").config();

const { Client, GatewayIntentBits, Partials, ChannelType, PermissionFlagsBits, REST, Routes, SlashCommandBuilder, EmbedBuilder } = require("discord.js");
const { joinVoiceChannel, entersState, VoiceConnectionStatus } = require("@discordjs/voice");
const { createClient } = require("@supabase/supabase-js");
const express = require("express");

// ============================================================
// تعريف الآيبيهات (المحددة فقط)
// ============================================================
const VOICE_CHANNEL_ID = "1555278659194196008";
const GENERAL_RULES_CHANNEL_ID = "1555278692660289668";
const WELCOME_CHANNEL_ID = "1555278687660810423";
const TICKET_VOICE_CHANNEL_ID = "1555278673278537821";
const AUTO_ROLE_ID = "1555278602407510140";

// ❌ القنوات الـ 3 الممنوع فيها وضع الروابط نهائياً
const LINK_BLOCKED_CHANNELS = [
    "1555278706056892516",
    "1555278707055267860",
    "1558134961201221652"
];

// ✅ قائمة الرولات المسموح لها بالمسح واستثناءات الروابط
const ALLOWED_ROLES_FOR_CLEAR = [
    "1556045968728662118",
    "1558141193462743040",
    "1555278592206839933",
    "1555278595579056184",
    "1555278598456221768",
    "1555278599601262693",
    "1557801895735730266",
    "1555278600742244362"
];

const WELCOME_IMAGE_URL = "https://raw.githubusercontent.com/titopanel2-oss/tool/main/welcome.gif";
const RULES_IMAGE_URL = "https://raw.githubusercontent.com/hertz100k/HERTZ-WEBSITE/main/%D8%A7%D9%84%D9%82%D9%88%D9%86%D9%8A%D9%86.jpg";
const SERVER_NAME = "𝙀𝙈𝙋𝙄𝙍𝙀";
const GUILD_ID = "1483218885024026644"; 

// ============================================================
// ✅ القوانين العامة
// ============================================================
const GENERAL_RULES_TEXT = 
`🇪🇬 **EGY / القوانين العامة للسيرفر:**

**1 -** يجب احترام جميع الأعضاء والإدارة، ويُمنع نهائياً السب، الشتم، السخرية، أو الإهانة بأي شكل من الأشكال.

**2 -** يمنع منعاً باتاً نشر الروابط الخارجية، الإعلانات للسيرفرات الأخرى، أو نشر روابط مشبوهة.

**3 -** يُرجى طرح استفساراتك أو مشاكل الموقع في رومات التكت (Tickets) أو الدعم المخصصة لذلك، وعدم إزعاج الإدارة في الرسائل الخاصة إلا بإذن مسبق.

**4 -** يرجى شرح مشكلتك أو طلبك بوضوح ورفقة الأدلة أو الصور إن وجدت لتسهيل عملية المساعدة.

**5 -** يُمنع نشر مواضيع أو منشورات في غير قنواتها المخصصة (مثل وضع استفسار في قناة الإعلانات أو الصور).

**6 -** يجب أن تكون الأسماء المستعارة وصور البروفايل لائقة وغير مخالفة للآداب العامة أو تحتوي على رموز مسيئة.

**7 -** يمنع نشر أي معلومات شخصية تخص أي عضو (أرقام هواتف، عناوين، إلخ) للحفاظ على أمان الجميع.

**8 -** أي قرار يصدر من الإدارة أو المشرفين يجب تنفيذه، وفي حال وجود اعتراض يمكن فتحه كشكوى بشكل رسمي وبأدب داخل رومات الدعم.

**9 -** يجب الالتزام بالمواعيد المحددة للطلبات، وتسليم الأعمال في القنوات أو بالطرق المخصصة لذلك فقط، وعدم التلاعب أو التأخير غير المبرر.

**10 -** يجب فتح تيكت للتقديم على الشغل، تسليم الشغل، أو طلب المساعدة في الشغل.

---

🇺🇸 **USA / Server General Rules:**

**1 -** Respect all members and staff. Swearing, cursing, mockery, or insults are strictly prohibited.

**2 -** Sharing external links, advertisements for other servers, or suspicious links is strictly prohibited.

**3 -** Please ask your site inquiries or issues in the designated Tickets or support channels, and do not DM staff without prior permission.

**4 -** Please explain your problem or request clearly, attaching evidence or screenshots if available to facilitate assistance.

**5 -** Posting topics or posts in incorrect channels (such as putting an inquiry in announcements or images) is prohibited.

**6 -** Nicknames and profile pictures must be appropriate and not violate public morals or contain offensive symbols.

**7 -** Sharing any personal information belonging to any member (phone numbers, addresses, etc.) is prohibited to maintain everyone's safety.

**8 -** Any decision issued by management or moderators must be obeyed. If you have an objection, you can formally and politely open a complaint inside support channels.

**9 -** You must adhere to specified deadlines, deliver work only in designated channels or methods, and avoid unjustified delays or manipulation.

**10 -** You must open a ticket to apply for work, deliver work, or request assistance with work.`;

const PORT = process.env.PORT || 3000;
const TARGET_HOURS = 1000;
let voiceSessionStartTime = null;

// ============================================================
// أنظمة منع التكرار الصارمة
// ============================================================
// 🔒 قفل دائم - لا يتم حذفه أبداً خلال جلسة البوت (يمنع التكرار نهائياً)
const welcomedMembersPermanent = new Set();
// 🔒 قفل مؤقت للأحداث المتزامنة (race condition protection)
const welcomeProcessingLock = new Set();

const clearProcessing = new Set();
const rulesProcessing = new Set();

const ticketOwnerMap = new Map();
const processedTickets = new Set();

const supabase = createClient(
    process.env.SUPABASE_URL || "",
    process.env.SUPABASE_KEY || ""
);

// ============================================================
// Discord Client
// ============================================================
const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildVoiceStates,
        GatewayIntentBits.GuildMembers,
        GatewayIntentBits.DirectMessages
    ],
    partials: [
        Partials.Message, Partials.Channel,
        Partials.GuildMember, Partials.User
    ]
});

let currentConnection = null;

// ============================================================
// Express Server
// ============================================================
const app = express();
app.use(express.json());

app.get("/", (req, res) => {
    const uptimeHours = voiceSessionStartTime ? ((Date.now() - voiceSessionStartTime) / (1000 * 60 * 60)).toFixed(2) : 0;
    res.send(`BOT is running. | Voice: ${uptimeHours}h / ${TARGET_HOURS}h | Welcomed: ${welcomedMembersPermanent.size}`);
});

// ============================================================
// ✅ دالة نشر القوانين العامة
// ============================================================
async function deployRules(guild, silent = false) {
    const everyoneRole = guild.roles.everyone;

    try {
        const generalChannel = await guild.channels.fetch(GENERAL_RULES_CHANNEL_ID).catch(() => null);
        if (!generalChannel) {
            console.error(`❌ [RULES] روم القوانين العامة مش موجود!`);
            return { success: false, message: 'روم القوانين العامة مش موجود، تأكد من الآي دي!' };
        }

        const botMember = guild.members.me;
        const perms = generalChannel.permissionsFor(botMember);
        if (!perms || !perms.has(PermissionFlagsBits.SendMessages)) {
            console.error(`❌ [RULES] البوت مش عنده صلاحية إرسال في روم القوانين العامة!`);
            return { success: false, message: 'البوت مش عنده صلاحية إرسال في روم القوانين العامة!' };
        }

        const generalEmbed = new EmbedBuilder()
            .setColor(0x2b2d31)
            .setTitle('📜 مرحباً بكم في قوانين السيرفر / Server Rules')
            .setDescription(GENERAL_RULES_TEXT)
            .setImage(RULES_IMAGE_URL)
            .setFooter({ 
                text: `${SERVER_NAME} - القوانين العامة`, 
                iconURL: guild.iconURL({ dynamic: true }) || undefined
            })
            .setTimestamp();

        await generalChannel.send({
            content: `${everyoneRole} **يرجى قراءة القوانين بعناية / Please read the rules carefully**`,
            embeds: [generalEmbed]
        });

        if (!silent) console.log(`✅ [RULES] تم نشر القوانين العامة في #${generalChannel.name}`);
    } catch (err) {
        console.error(`❌ [RULES] خطأ في نشر القوانين العامة:`, err.message);
        return { success: false, message: 'خطأ في نشر القوانين العامة!' };
    }

    return { success: true, message: '✅ تم نشر القوانين العامة بنجاح!' };
}

// ============================================================
// نظام تيكت فويس التلقائي
// ============================================================
client.on('channelCreate', async (channel) => {
    try {
        if (!channel.guild) return;
        const channelName = channel.name.toLowerCase();

        if (channelName.includes('ticket') || channelName.includes('تيكت')) {
            if (processedTickets.has(channel.id)) return;
            processedTickets.add(channel.id);

            const ticketVoice = await channel.guild.channels.fetch(TICKET_VOICE_CHANNEL_ID).catch(() => null);
            if (!ticketVoice) return;

            setTimeout(async () => {
                try {
                    const permissionOverwrites = channel.permissionOverwrites.cache;
                    for (const [id, overwrite] of permissionOverwrites) {
                        const member = await channel.guild.members.fetch(id).catch(() => null);
                        if (member && !member.user.bot) {
                            ticketOwnerMap.set(channel.id, member.id);

                            await ticketVoice.permissionOverwrites.edit(member.id, {
                                [PermissionFlagsBits.ViewChannel]: true,
                                [PermissionFlagsBits.Connect]: true,
                                [PermissionFlagsBits.Speak]: true
                            });

                            await channel.send({
                                content: `مرحباً بك ${member} 👋\nتم فتح تيكت الدعم الخاصة بك. يمكنك الدخول إلى روم الفويس المخصص هنا: <#${TICKET_VOICE_CHANNEL_ID}>`
                            }).catch(() => {});

                            if (member.voice && member.voice.channelId) {
                                await member.voice.setChannel(ticketVoice.id).catch(() => {});
                                console.log(`🚀 [TICKET VOICE MOVE] تم نقل ${member.user.tag} تلقائياً إلى الفويس.`);
                            } else {
                                console.log(`🔓 [TICKET VOICE OPEN] تم إظهار الفويس لـ ${member.user.tag}`);
                            }
                            break;
                        }
                    }
                } catch (e) {
                    console.error("❌ [TICKET VOICE OVERWRITE ERROR]", e.message);
                }
            }, 1500);
        }
    } catch (error) {
        console.error("❌ [CHANNEL CREATE ERROR]", error.message);
    }
});

client.on('channelDelete', async (channel) => {
    try {
        if (!channel.guild) return;
        const channelName = channel.name.toLowerCase();

        if (channelName.includes('ticket') || channelName.includes('تيكت')) {
            const ticketVoice = await channel.guild.channels.fetch(TICKET_VOICE_CHANNEL_ID).catch(() => null);
            if (!ticketVoice) return;

            const ownerId = ticketOwnerMap.get(channel.id);
            if (ownerId) {
                const member = await channel.guild.members.fetch(ownerId).catch(() => null);
                if (member && member.voice && member.voice.channelId === TICKET_VOICE_CHANNEL_ID) {
                    await member.voice.disconnect("تم إغلاق التيكت").catch(() => {});
                    console.log(`🔌 [TICKET VOICE DISCONNECT] تم طرد ${member.user.tag} من الفويس.`);
                }

                await ticketVoice.permissionOverwrites.delete(ownerId).catch(() => {});

                ticketOwnerMap.delete(channel.id);
                processedTickets.delete(channel.id);
                console.log(`🔒 [TICKET VOICE CLOSE] تم إخفاء الفويس نهائياً بعد إغلاق التيكت.`);
            } else {
                processedTickets.delete(channel.id);
            }
        }
    } catch (error) {
        console.error("❌ [CHANNEL DELETE ERROR]", error.message);
    }
});

// ============================================================
// 🔒 نظام الترحيب المحصّن ضد التكرار نهائياً
// ============================================================
client.on('guildMemberAdd', async (member) => {
    if (member.user.bot) return;
    const memberId = member.id;

    // ✅ الفحص القاطع رقم 1: قفل دائم (لا يُحذف أبداً خلال جلسة البوت)
    if (welcomedMembersPermanent.has(memberId)) {
        console.log(`🛡️ [DUPLICATE BLOCKED] تم تجاهل حدث مكرر للعضو: ${member.user.tag}`);
        return;
    }

    // ✅ الفحص القاطع رقم 2: قفل المعالجة المتزامنة (Race Condition)
    if (welcomeProcessingLock.has(memberId)) {
        console.log(`🛡️ [RACE CONDITION BLOCKED] حدث متزامن لنفس العضو: ${member.user.tag}`);
        return;
    }

    // ✅ إضافة العضو للقفلين فوراً قبل أي عملية
    welcomeProcessingLock.add(memberId);
    welcomedMembersPermanent.add(memberId);

    console.log(`\n🔔 [SINGLE WELCOME] استقبال عضو جديد: ${member.user.tag} (${memberId})`);

    try {
        // 1. إعطاء الرول التلقائي
        const role = member.guild.roles.cache.get(AUTO_ROLE_ID);
        if (role) {
            await member.roles.add(role, 'رول تلقائي للأعضاء الجدد').catch(() => {});
            console.log(`✅ [AUTO ROLE] تم إعطاء الرول التلقائي لـ ${member.user.tag}`);
        }

        // 2. إرسال رسالة الترحيب في قناة الترحيب
        const welcomeChannel = await member.guild.channels.fetch(WELCOME_CHANNEL_ID).catch(() => null);
        if (welcomeChannel) {
            const channelEmbed = new EmbedBuilder()
                .setColor(0x5865F2)
                .setTitle(`مرحباً بك في السيرفر`)
                .setDescription(`أهلاً بك يا <@${memberId}> في سيرفر **${SERVER_NAME}**`)
                .setImage(WELCOME_IMAGE_URL)
                .setThumbnail(member.user.displayAvatarURL({ dynamic: true, size: 256 }))
                .setTimestamp();

            await welcomeChannel.send({ embeds: [channelEmbed] }).catch(() => {});
            console.log(`✅ [WELCOME CHANNEL] تم إرسال رسالة الترحيب لـ ${member.user.tag}`);
        }

        // 3. إرسال رسالة ترحيب في الخاص (DM)
        const dmEmbed = new EmbedBuilder()
            .setColor(0x5865F2)
            .setTitle(`مرحباً بك في سيرفر ${SERVER_NAME} 👋`)
            .setDescription(`أهلاً وسهلاً بك يا <@${memberId}>!\nسعداء بوجودك معنا في سيرفر **${SERVER_NAME}**. نتمنى لك وقتاً ممتعاً.`)
            .setThumbnail(member.guild.iconURL({ dynamic: true }) || member.user.displayAvatarURL({ dynamic: true }))
            .setFooter({ text: `${SERVER_NAME} Community` })
            .setTimestamp();

        await member.send({ embeds: [dmEmbed] }).catch(() => {
            console.log(`⚠️ [WELCOME DM] الخاص مغلق لـ ${member.user.tag}`);
        });

        console.log(`✅ [WELCOME COMPLETE] تم الترحيب بـ ${member.user.tag} بنجاح (لن يتم الترحيب به مجدداً)`);

    } catch (error) {
        console.error(`❌ [WELCOME ERROR]:`, error.message);
    } finally {
        // ✅ تحرير قفل المعالجة المتزامنة فقط (القفل الدائم يبقى للأبد)
        welcomeProcessingLock.delete(memberId);
    }
});

// ============================================================
// 🛡️ نظام حماية الروابط في القنوات الـ 3 المحددة مع تايم أوت
// ============================================================
client.on('messageCreate', async message => {
    try {
        if (!message.guild || message.author.bot) return;

        if (LINK_BLOCKED_CHANNELS.includes(message.channel.id)) {
            const member = message.member;
            if (!member) return;

            const hasAllowedRole = ALLOWED_ROLES_FOR_CLEAR.some(roleId => member.roles.cache.has(roleId));
            const isAdmin = member.permissions.has(PermissionFlagsBits.Administrator);

            if (hasAllowedRole || isAdmin) return;

            const linkRegex = /(https?:\/\/[^\s]+|www\.[^\s]+|discord\.gg\/[^\s]+|[a-zA-Z0-9][-a-zA-Z0-90-9]+\.[a-z]{2,}(\/[^\s]*)?)/i;

            if (linkRegex.test(message.content)) {
                await message.delete().catch(() => {});

                const warningMsg = await message.channel.send({
                    content: `❌ ${message.author}, ممنوع إرسال الروابط في هذه القناة!`
                }).catch(() => {});
                
                setTimeout(() => {
                    if (warningMsg) warningMsg.delete().catch(() => {});
                }, 5000);

                if (member.moderatable) {
                    await member.timeout(5 * 60 * 1000, "إرسال رابط في قناة ممنوعة").catch(() => {});
                    console.log(`⚠️ [ANTI-LINK] تم عمل تايم أوت لـ ${message.author.tag} لدقيقة بسبب إرسال رابط.`);
                }
            }
        }
    } catch (err) {
        console.error("❌ [ANTI-LINK ERROR]", err.message);
    }
});

// ============================================================
// 🎙️ دالة الاتصال المضمون بالفويس الرئيسي 24/7
// ============================================================
async function connectToVoiceChannel() {
    try {
        const guild = client.guilds.cache.get(GUILD_ID) || client.guilds.cache.first();
        if (!guild) return setTimeout(connectToVoiceChannel, 2000);

        const channel = await guild.channels.fetch(VOICE_CHANNEL_ID).catch(() => null);
        if (!channel) {
            console.error(`❌ [VOICE ERROR] لم يتم العثور على القناة الصوتية بالآي دي: ${VOICE_CHANNEL_ID}`);
            return setTimeout(connectToVoiceChannel, 3000);
        }

        const connection = joinVoiceChannel({
            channelId: channel.id,
            guildId: guild.id,
            adapterCreator: guild.voiceAdapterCreator,
            selfDeaf: false,
            selfMute: false
        });

        currentConnection = connection;

        connection.on(VoiceConnectionStatus.Ready, () => {
            if (!voiceSessionStartTime) voiceSessionStartTime = Date.now();
            console.log(`✅ [VOICE SUCCESS] البوت متصل ومقيم بنجاح داخل روم الفويس 24/7: #${channel.name}`);
        });

        connection.on(VoiceConnectionStatus.Disconnected, async () => {
            try {
                await Promise.race([
                    entersState(connection, VoiceConnectionStatus.Signalling, 2_000),
                    entersState(connection, VoiceConnectionStatus.Connecting, 2_000),
                ]);
            } catch (error) {
                try { connection.destroy(); } catch (e) {}
                currentConnection = null;
                setTimeout(connectToVoiceChannel, 1000);
            }
        });

        connection.on('error', (err) => {
            console.error("⚠️ [VOICE CONNECTION ERROR]", err.message);
            try { connection.destroy(); } catch (e) {}
            currentConnection = null;
            setTimeout(connectToVoiceChannel, 1000);
        });

    } catch (error) {
        console.error("❌ [VOICE FATAL ERROR]", error.message);
        setTimeout(connectToVoiceChannel, 2000);
    }
}

// ============================================================
// Ready Event
// ============================================================
client.once("ready", async () => {
    console.log(`\n============================================`);
    console.log(`✅ BOT is online: ${client.user.tag}`);
    console.log(`📋 MAIN VOICE CHANNEL (24/7): ${VOICE_CHANNEL_ID}`);
    console.log(`📋 TICKET VOICE CHANNEL: ${TICKET_VOICE_CHANNEL_ID}`);
    console.log(`📋 GENERAL RULES CHANNEL: ${GENERAL_RULES_CHANNEL_ID}`);
    console.log(`📋 LINK BLOCKED CHANNELS: ${LINK_BLOCKED_CHANNELS.length} channels configured`);
    console.log(`🛡️ Welcome System: PERMANENT DUPLICATE PROTECTION ACTIVE`);
    console.log(`============================================\n`);

    connectToVoiceChannel();

    // ضبط فويس التيكت ليكون مخفياً افتراضياً عن الجميع
    try {
        const guild = client.guilds.cache.get(GUILD_ID) || client.guilds.cache.first();
        if (guild) {
            const ticketVoice = await guild.channels.fetch(TICKET_VOICE_CHANNEL_ID).catch(() => null);
            if (ticketVoice) {
                await ticketVoice.permissionOverwrites.edit(guild.roles.everyone, {
                    [PermissionFlagsBits.ViewChannel]: false,
                    [PermissionFlagsBits.Connect]: false
                });
                console.log(`🔒 [SETUP] تم ضبط فويس التيكت ليكون مخفياً افتراضياً عن الجميع.`);
            }
        }
    } catch (e) {}

    const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);
    try {
        const commands = [
            new SlashCommandBuilder()
                .setName('clear')
                .setDescription('حذف عدد معين من الرسائل بسرعة')
                .addIntegerOption(option =>
                    option.setName('count')
                        .setDescription('عدد الرسائل المراد حذفها (من 1 إلى 100)')
                        .setRequired(true)
                        .setMinValue(1)
                        .setMaxValue(100)
                ),
            new SlashCommandBuilder()
                .setName('sendrules')
                .setDescription('نشر القوانين العامة في الروم المخصص')
        ].map(command => command.toJSON());

        await rest.put(
            Routes.applicationCommands(client.user.id),
            { body: commands },
        );
        console.log('✅ تم تسجيل الأوامر (clear, sendrules) بنجاح!');
    } catch (error) {
        console.error('❌ خطأ في تسجيل أوامر السلاش:', error);
    }

    setTimeout(async () => {
        try {
            const guild = client.guilds.cache.get(GUILD_ID) || client.guilds.cache.first();
            if (guild) {
                console.log('\n📜 [RULES] جاري نشر القوانين العامة تلقائيًا...');
                const result = await deployRules(guild, false);
                if (result.success) {
                    console.log('✅ [RULES] تم نشر القوانين بنجاح عند التشغيل!');
                } else {
                    console.error(`❌ [RULES] ${result.message}`);
                }
            }
        } catch (err) {
            console.error('❌ [RULES] خطأ في النشر التلقائي:', err.message);
        }
    }, 3000);

    // مراقبة دورية مستمرة لضمان تواجد البوت في الروم الصوتي 24 ساعة
    setInterval(async () => {
        if (!currentConnection || currentConnection.state.status === VoiceConnectionStatus.Disconnected || currentConnection.state.status === VoiceConnectionStatus.Destroyed) {
            connectToVoiceChannel();
        }
    }, 3000);
});

// ============================================================
// التعامل مع أوامر السلاش
// ============================================================
client.on('interactionCreate', async interaction => {
    if (!interaction.isChatInputCommand()) return;

    if (interaction.commandName === 'clear') {
        const userId = interaction.user.id;
        const member = interaction.member;

        const hasAllowedRole = member && ALLOWED_ROLES_FOR_CLEAR.some(roleId => member.roles.cache.has(roleId));

        if (!hasAllowedRole) {
            await interaction.reply({ 
                content: '❌ عذراً، هذه الخاصية مخصصة للأدمن فقط.', 
                ephemeral: true 
            });
            return;
        }

        if (clearProcessing.has(userId)) {
            await interaction.reply({ content: '⏳ في عملية مسح جارية بالفعل.', ephemeral: true });
            return;
        }

        clearProcessing.add(userId);

        try {
            const count = interaction.options.getInteger('count');
            await interaction.deferReply({ ephemeral: true });
            const deleted = await interaction.channel.bulkDelete(count, true);
            await interaction.editReply({ content: `✅ تم بنجاح حذف **${deleted.size}** رسالة بكل نظافة.` });
        } catch (error) {
            console.error('❌ خطأ أثناء مسح الرسائل:', error);
            try {
                await interaction.editReply({ content: '❌ حدث خطأ أثناء محاولة مسح الرسائل.' });
            } catch (e) {}
        } finally {
            clearProcessing.delete(userId);
        }
    }

    if (interaction.commandName === 'sendrules') {
        const userId = interaction.user.id;

        if (rulesProcessing.has(userId)) {
            await interaction.reply({ content: '⏳ في عملية نشر قوانين جارية بالفعل.', ephemeral: true });
            return;
        }

        rulesProcessing.add(userId);

        try {
            await interaction.deferReply({ ephemeral: true });
            const result = await deployRules(interaction.guild, true);
            await interaction.editReply({ content: result.message });
        } catch (error) {
            console.error('❌ خطأ في نشر القوانين:', error);
            try {
                await interaction.editReply({ content: '❌ حدث خطأ أثناء نشر القوانين.' });
            } catch (e) {}
        } finally {
            rulesProcessing.delete(userId);
        }
    }
});

process.on('unhandledRejection', () => {});
process.on('uncaughtException', () => {});

app.listen(PORT, "0.0.0.0", () => {
    console.log(`🌐 Server Port ${PORT}`);
});

client.login(process.env.DISCORD_TOKEN);
