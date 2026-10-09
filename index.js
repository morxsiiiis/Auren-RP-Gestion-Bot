require('dotenv').config();
const fs = require('node:fs');
const path = require('node:path');
const {
  Client, GatewayIntentBits, Partials, Events, REST, Routes,
  SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder,
  ActionRowBuilder, ButtonBuilder, ButtonStyle
} = require('discord.js');

const TOKEN = process.env.DISCORD_TOKEN;
const CLIENT_ID = process.env.CLIENT_ID;
const GUILD_ID = process.env.GUILD_ID;
if (!TOKEN || !CLIENT_ID || !GUILD_ID) {
  console.error('Faltan DISCORD_TOKEN, CLIENT_ID o GUILD_ID en el archivo .env.');
  process.exit(1);
}

const DATA_DIR = path.join(__dirname, 'data');
const DB_FILE = path.join(DATA_DIR, 'database.json');
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
if (!fs.existsSync(DB_FILE)) fs.writeFileSync(DB_FILE, JSON.stringify({ cases: [], staffNotes: [], polls: [], suggestions: [], giveaways: [], config: {} }, null, 2));
function readDB() {
  try { return JSON.parse(fs.readFileSync(DB_FILE, 'utf8')); }
  catch { return { cases: [], staffNotes: [], polls: [], suggestions: [], giveaways: [], config: {} }; }
}
function writeDB(db) { fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2)); }
function nextCase(db) { return (db.cases.reduce((m, c) => Math.max(m, c.id), 0) || 0) + 1; }
const adminRoles = (process.env.ADMIN_ROLE_IDS || '').split(',').map(s => s.trim()).filter(Boolean);
const staffRoles = (process.env.STAFF_ROLE_IDS || '').split(',').map(s => s.trim()).filter(Boolean);
function hasRole(member, ids) { return member?.roles?.cache?.some(r => ids.includes(r.id)) || false; }
function isAdmin(i) {
  return i.memberPermissions?.has(PermissionFlagsBits.Administrator) ||
    (adminRoles.length && hasRole(i.member, adminRoles));
}
function isStaff(i) {
  return isAdmin(i) || i.memberPermissions?.has(PermissionFlagsBits.ModerateMembers) ||
    (staffRoles.length && hasRole(i.member, staffRoles));
}
function needStaff(i) { return isStaff(i); }
function needAdmin(i) { return isAdmin(i); }
const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMembers, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent],
  partials: [Partials.Message, Partials.Channel, Partials.GuildMember]
});
const commands = [];
const add = c => commands.push(c);

add(new SlashCommandBuilder().setName('ping').setDescription('Comprueba si el bot responde.'));
add(new SlashCommandBuilder().setName('kick').setDescription('Expulsa a un miembro.').setDefaultMemberPermissions(PermissionFlagsBits.KickMembers).addUserOption(o=>o.setName('usuario').setDescription('Miembro a expulsar').setRequired(true)).addStringOption(o=>o.setName('motivo').setDescription('Motivo').setRequired(true)));
add(new SlashCommandBuilder().setName('ban').setDescription('Banea a un miembro.').setDefaultMemberPermissions(PermissionFlagsBits.BanMembers).addUserOption(o=>o.setName('usuario').setDescription('Miembro a banear').setRequired(true)).addStringOption(o=>o.setName('motivo').setDescription('Motivo').setRequired(true)));
add(new SlashCommandBuilder().setName('unban').setDescription('Quita un baneo usando el ID.').setDefaultMemberPermissions(PermissionFlagsBits.BanMembers).addStringOption(o=>o.setName('usuario_id').setDescription('ID del usuario').setRequired(true)).addStringOption(o=>o.setName('motivo').setDescription('Motivo').setRequired(false)));
add(new SlashCommandBuilder().setName('timeout').setDescription('Aplica un timeout.').setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers).addUserOption(o=>o.setName('usuario').setDescription('Miembro').setRequired(true)).addIntegerOption(o=>o.setName('minutos').setDescription('Duración en minutos (1-40320)').setMinValue(1).setMaxValue(40320).setRequired(true)).addStringOption(o=>o.setName('motivo').setDescription('Motivo').setRequired(true)));
add(new SlashCommandBuilder().setName('untimeout').setDescription('Retira un timeout.').setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers).addUserOption(o=>o.setName('usuario').setDescription('Miembro').setRequired(true)).addStringOption(o=>o.setName('motivo').setDescription('Motivo').setRequired(false)));
add(new SlashCommandBuilder().setName('clear').setDescription('Borra entre 1 y 100 mensajes recientes.').setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages).addIntegerOption(o=>o.setName('cantidad').setDescription('Cantidad de mensajes').setMinValue(1).setMaxValue(100).setRequired(true)));
add(new SlashCommandBuilder().setName('modlogs').setDescription('Consulta las sanciones registradas de un usuario.').setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers).addUserOption(o=>o.setName('usuario').setDescription('Usuario').setRequired(true)));
add(new SlashCommandBuilder().setName('caseinfo').setDescription('Consulta un caso de moderación por número.').setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers).addIntegerOption(o=>o.setName('numero').setDescription('Número de caso').setMinValue(1).setRequired(true)));
add(new SlashCommandBuilder().setName('stafflist').setDescription('Muestra miembros con roles de staff configurados.'));
add(new SlashCommandBuilder().setName('staffnote').setDescription('Añade una nota interna sobre un miembro.').setDefaultMemberPermissions(PermissionFlagsBits.Administrator).addUserOption(o=>o.setName('usuario').setDescription('Miembro del staff').setRequired(true)).addStringOption(o=>o.setName('nota').setDescription('Nota privada, visible solo para administración').setRequired(true)));
add(new SlashCommandBuilder().setName('staffhistory').setDescription('Consulta las notas internas de un miembro.').setDefaultMemberPermissions(PermissionFlagsBits.Administrator).addUserOption(o=>o.setName('usuario').setDescription('Miembro').setRequired(true)));
add(new SlashCommandBuilder().setName('announce').setDescription('Publica un anuncio en un canal.').setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages).addChannelOption(o=>o.setName('canal').setDescription('Canal de destino').setRequired(true)).addStringOption(o=>o.setName('titulo').setDescription('Título').setRequired(true)).addStringOption(o=>o.setName('mensaje').setDescription('Contenido del anuncio').setRequired(true)));
add(new SlashCommandBuilder().setName('roleadd').setDescription('Asigna un rol a un usuario.').setDefaultMemberPermissions(PermissionFlagsBits.ManageRoles).addUserOption(o=>o.setName('usuario').setDescription('Usuario').setRequired(true)).addRoleOption(o=>o.setName('rol').setDescription('Rol').setRequired(true)));
add(new SlashCommandBuilder().setName('roleremove').setDescription('Retira un rol de un usuario.').setDefaultMemberPermissions(PermissionFlagsBits.ManageRoles).addUserOption(o=>o.setName('usuario').setDescription('Usuario').setRequired(true)).addRoleOption(o=>o.setName('rol').setDescription('Rol').setRequired(true)));
add(new SlashCommandBuilder().setName('nick').setDescription('Cambia el apodo de un miembro.').setDefaultMemberPermissions(PermissionFlagsBits.ManageNicknames).addUserOption(o=>o.setName('usuario').setDescription('Miembro').setRequired(true)).addStringOption(o=>o.setName('apodo').setDescription('Nuevo apodo; usa limpiar para quitarlo').setRequired(true)));
add(new SlashCommandBuilder().setName('lock').setDescription('Bloquea mensajes en un canal.').setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels).addChannelOption(o=>o.setName('canal').setDescription('Canal (por defecto este canal)').setRequired(false)));
add(new SlashCommandBuilder().setName('unlock').setDescription('Desbloquea mensajes en un canal.').setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels).addChannelOption(o=>o.setName('canal').setDescription('Canal (por defecto este canal)').setRequired(false)));
add(new SlashCommandBuilder().setName('slowmode').setDescription('Configura el modo lento (0-21600 segundos).').setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels).addIntegerOption(o=>o.setName('segundos').setDescription('Segundos').setMinValue(0).setMaxValue(21600).setRequired(true)));
add(new SlashCommandBuilder().setName('userinfo').setDescription('Muestra información de un usuario.').addUserOption(o=>o.setName('usuario').setDescription('Usuario').setRequired(false)));
add(new SlashCommandBuilder().setName('serverinfo').setDescription('Muestra información del servidor.'));
add(new SlashCommandBuilder().setName('poll').setDescription('Crea una encuesta con dos opciones.').setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages).addStringOption(o=>o.setName('pregunta').setDescription('Pregunta').setRequired(true)).addStringOption(o=>o.setName('opcion_a').setDescription('Primera opción').setRequired(true)).addStringOption(o=>o.setName('opcion_b').setDescription('Segunda opción').setRequired(true)));
add(new SlashCommandBuilder().setName('suggest').setDescription('Envía una sugerencia a la comunidad.').addStringOption(o=>o.setName('idea').setDescription('Tu sugerencia').setRequired(true)));
add(new SlashCommandBuilder().setName('suggestionstatus').setDescription('Aprueba o rechaza una sugerencia.').setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages).addIntegerOption(o=>o.setName('numero').setDescription('Número de sugerencia').setMinValue(1).setRequired(true)).addStringOption(o=>o.setName('estado').setDescription('Decisión').setRequired(true).addChoices({name:'Aprobada',value:'Aprobada'},{name:'Rechazada',value:'Rechazada'})).addStringOption(o=>o.setName('nota').setDescription('Nota opcional').setRequired(false)));
add(new SlashCommandBuilder().setName('giveaway').setDescription('Inicia un sorteo sencillo en este canal.').setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages).addStringOption(o=>o.setName('premio').setDescription('Premio').setRequired(true)).addIntegerOption(o=>o.setName('minutos').setDescription('Duración en minutos (1-10080)').setMinValue(1).setMaxValue(10080).setRequired(true)));
add(new SlashCommandBuilder().setName('endgiveaway').setDescription('Finaliza un sorteo y elige un ganador al azar.').setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages).addStringOption(o=>o.setName('mensaje_id').setDescription('ID del mensaje del sorteo').setRequired(true)));

async function log(guild, title, description, color=0xE84393) {
  const channelId = process.env.LOG_CHANNEL_ID;
  if (!channelId || !guild) return;
  const ch = await guild.channels.fetch(channelId).catch(()=>null);
  if (!ch?.isTextBased()) return;
  await ch.send({ embeds: [new EmbedBuilder().setColor(color).setTitle(title).setDescription(description.slice(0,4000)).setTimestamp()] }).catch(()=>{});
}
function addCase(guildId, type, userId, moderatorId, reason, duration=null) {
  const db=readDB(), id=nextCase(db);
  db.cases.push({id,guildId,type,userId,moderatorId,reason,duration,createdAt:new Date().toISOString()});
  writeDB(db); return id;
}
async function replyErr(i, message) {
  const payload={content:message,ephemeral:true};
  if (i.deferred || i.replied) return i.followUp(payload).catch(()=>{});
  return i.reply(payload).catch(()=>{});
}
client.once(Events.ClientReady, c => console.log(`Aurenrp | Gestion conectado como ${c.user.tag}`));

client.on(Events.InteractionCreate, async i => {
  if (i.isButton()) {
    if (i.customId.startsWith('poll_')) {
      const [, pollId, option] = i.customId.split('_');
      const db=readDB(), p=db.polls.find(x=>String(x.id)===pollId);
      if (!p) return replyErr(i,'Esta encuesta ya no está disponible.');
      if (p.votes?.[i.user.id]) return replyErr(i,'Ya votaste en esta encuesta.');
      p.votes ||= {}; p.votes[i.user.id]=option; writeDB(db);
      return i.reply({content:'¡Tu voto fue registrado!',ephemeral:true});
    }
    if (i.customId.startsWith('suggest_')) {
      const [,id,decision]=i.customId.split('_');
      if (!isStaff(i)) return replyErr(i,'Solo el staff puede revisar sugerencias.');
      const db=readDB(), s=db.suggestions.find(x=>String(x.id)===id);
      if (!s) return replyErr(i,'No encontré esa sugerencia.');
      s.status=decision==='approve'?'Aprobada':'Rechazada'; s.reviewedBy=i.user.id; writeDB(db);
      await i.update({embeds:[EmbedBuilder.from(i.message.embeds[0]).setColor(decision==='approve'?0x2ECC71:0xE74C3C).addFields({name:'Estado',value:s.status},{name:'Revisada por',value:`<@${i.user.id}>`})],components:[]});
      return;
    }
    if (i.customId.startsWith('gw_')) {
      const messageId=i.customId.slice(3), db=readDB(), g=db.giveaways.find(x=>x.messageId===messageId && !x.ended);
      if (!g) return replyErr(i,'Este sorteo ya terminó.');
      if (!g.entries.includes(i.user.id)) g.entries.push(i.user.id);
      writeDB(db); return i.reply({content:'¡Ya estás participando en el sorteo!',ephemeral:true});
    }
    return;
  }
  if (!i.isChatInputCommand()) return;
  const cmd=i.commandName;
  try {
    if (cmd==='ping') return i.reply(`🏓 Pong! Latencia: ${client.ws.ping} ms`);
    if (cmd==='kick' || cmd==='ban') {
      const user=i.options.getUser('usuario'), reason=i.options.getString('motivo');
      const member=await i.guild.members.fetch(user.id).catch(()=>null);
      if (!member) return replyErr(i,'No encontré al miembro en este servidor.');
      if (user.id===i.user.id || user.id===client.user.id) return replyErr(i,'No puedes aplicar esta sanción a ese usuario.');
      if (member.roles.highest.position >= i.member.roles.highest.position && i.guild.ownerId!==i.user.id) return replyErr(i,'Tu rango debe estar por encima del usuario.');
      if (cmd==='kick') await member.kick(`${reason} | Staff: ${i.user.tag}`);
      else await i.guild.members.ban(user.id,{reason:`${reason} | Staff: ${i.user.tag}`});
      const n=addCase(i.guildId,cmd,user.id,i.user.id,reason);
      await log(i.guild,`Sanción: ${cmd}`,`Caso #${n}\nUsuario: ${user.tag} (${user.id})\nStaff: ${i.user.tag}\nMotivo: ${reason}`);
      return i.reply(`✅ ${user.tag} recibió **${cmd}**. Caso #${n}.`);
    }
    if (cmd==='unban') {
      const id=i.options.getString('usuario_id'), reason=i.options.getString('motivo')||'No especificado';
      await i.guild.members.unban(id,reason);
      const n=addCase(i.guildId,'unban',id,i.user.id,reason);
      await log(i.guild,'Baneo retirado',`Caso #${n}\nUsuario ID: ${id}\nStaff: ${i.user.tag}\nMotivo: ${reason}`);
      return i.reply(`✅ Baneo retirado para ${id}. Caso #${n}.`);
    }
    if (cmd==='timeout' || cmd==='untimeout') {
      const user=i.options.getUser('usuario'), member=await i.guild.members.fetch(user.id).catch(()=>null);
      if (!member) return replyErr(i,'No encontré al miembro.');
      if (user.id===i.user.id || user.id===client.user.id) return replyErr(i,'No puedes aplicar esta acción a ese usuario.');
      if (member.roles.highest.position >= i.member.roles.highest.position && i.guild.ownerId!==i.user.id) return replyErr(i,'Tu rango debe estar por encima del usuario.');
      const reason=i.options.getString('motivo')||'No especificado';
      let duration=null;
      if (cmd==='timeout') { duration=i.options.getInteger('minutos'); await member.timeout(duration*60000,reason); }
      else await member.timeout(null,reason);
      const n=addCase(i.guildId,cmd,user.id,i.user.id,reason,duration);
      await log(i.guild,`Sanción: ${cmd}`,`Caso #${n}\nUsuario: ${user.tag}\nStaff: ${i.user.tag}\nMotivo: ${reason}${duration?`\nDuración: ${duration} minutos`:''}`);
      return i.reply(`✅ Acción **${cmd}** completada para ${user.tag}. Caso #${n}.`);
    }
    if (cmd==='clear') {
      const amount=i.options.getInteger('cantidad');
      const deleted=await i.channel.bulkDelete(amount,true);
      await log(i.guild,'Mensajes borrados',`${i.user.tag} borró ${deleted.size} mensajes en ${i.channel}.`);
      return i.reply({content:`🧹 Borré ${deleted.size} mensajes.`,ephemeral:true});
    }
    if (cmd==='modlogs') {
      if (!needStaff(i)) return replyErr(i,'No tienes permiso para consultar sanciones.');
      const user=i.options.getUser('usuario'), db=readDB(), rows=db.cases.filter(c=>c.guildId===i.guildId && c.userId===user.id).slice(-10).reverse();
      return i.reply({content:rows.length?rows.map(c=>`**#${c.id} ${c.type}** — ${c.reason} · <t:${Math.floor(new Date(c.createdAt).getTime()/1000)}:R> · Staff <@${c.moderatorId}>`).join('\n'):`No hay sanciones registradas para ${user.tag}.`,ephemeral:true});
    }
    if (cmd==='caseinfo') {
      if (!needStaff(i)) return replyErr(i,'No tienes permiso.');
      const id=i.options.getInteger('numero'), c=readDB().cases.find(x=>x.id===id && x.guildId===i.guildId);
      if (!c) return replyErr(i,'No existe ese caso.');
      return i.reply({content:`**Caso #${c.id} — ${c.type}**\nUsuario: <@${c.userId}> (${c.userId})\nStaff: <@${c.moderatorId}>\nMotivo: ${c.reason}\nFecha: <t:${Math.floor(new Date(c.createdAt).getTime()/1000)}:F>${c.duration?`\nDuración: ${c.duration} minutos`:''}`,ephemeral:true});
    }
    if (cmd==='stafflist') {
      const members=await i.guild.members.fetch();
      const list=members.filter(m=>m.permissions.has(PermissionFlagsBits.Administrator)||hasRole(m,staffRoles)||hasRole(m,adminRoles)).first(40);
      return i.reply({embeds:[new EmbedBuilder().setColor(0xE84393).setTitle('AurenRP — Equipo de staff').setDescription(list.length?list.map(m=>`${m.user} — ${m.roles.highest}`).join('\n'):'No se encontraron miembros. Configura STAFF_ROLE_IDS y ADMIN_ROLE_IDS en .env.')],ephemeral:true});
    }
    if (cmd==='staffnote') {
      if (!needAdmin(i)) return replyErr(i,'Solo administración puede añadir notas internas.');
      const user=i.options.getUser('usuario'), note=i.options.getString('nota'), db=readDB();
      db.staffNotes.push({userId:user.id,authorId:i.user.id,note,createdAt:new Date().toISOString()}); writeDB(db);
      await log(i.guild,'Nota interna de staff',`Usuario: ${user.tag}\nAutor: ${i.user.tag}\nNota: ${note}`);
      return i.reply({content:`Nota privada guardada para ${user.tag}.`,ephemeral:true});
    }
    if (cmd==='staffhistory') {
      if (!needAdmin(i)) return replyErr(i,'Solo administración puede consultar notas internas.');
      const user=i.options.getUser('usuario'), rows=readDB().staffNotes.filter(n=>n.userId===user.id).slice(-10).reverse();
      return i.reply({content:rows.length?rows.map(n=>`• ${n.note} — <@${n.authorId}> · <t:${Math.floor(new Date(n.createdAt).getTime()/1000)}:R>`).join('\n'):'No hay notas para este usuario.',ephemeral:true});
    }
    if (cmd==='announce') {
      const ch=i.options.getChannel('canal'), title=i.options.getString('titulo'), message=i.options.getString('mensaje');
      if (!ch.isTextBased() || !ch.send) return replyErr(i,'Selecciona un canal de texto.');
      await ch.send({embeds:[new EmbedBuilder().setColor(0xE84393).setTitle(title).setDescription(message).setFooter({text:`AurenRP | Anuncio oficial`}).setTimestamp()]});
      await log(i.guild,'Anuncio publicado',`${i.user.tag} publicó un anuncio en ${ch}.`);
      return i.reply({content:'📢 Anuncio publicado.',ephemeral:true});
    }
    if (cmd==='roleadd'||cmd==='roleremove') {
      const user=i.options.getUser('usuario'), role=i.options.getRole('rol'), member=await i.guild.members.fetch(user.id).catch(()=>null);
      if (!member) return replyErr(i,'No encontré al miembro.');
      if (role.managed || role.position>=i.guild.members.me.roles.highest.position) return replyErr(i,'No puedo gestionar ese rol por la jerarquía de roles.');
      if (cmd==='roleadd') await member.roles.add(role); else await member.roles.remove(role);
      await log(i.guild,'Cambio de rol',`${i.user.tag} ejecutó ${cmd} en ${user.tag}: ${role.name}`);
      return i.reply(`✅ Rol ${cmd==='roleadd'?'asignado':'retirado'}: ${role}.`);
    }
    if (cmd==='nick') {
      const user=i.options.getUser('usuario'), nickname=i.options.getString('apodo'), member=await i.guild.members.fetch(user.id).catch(()=>null);
      if (!member) return replyErr(i,'No encontré al miembro.');
      await member.setNickname(nickname.toLowerCase()==='limpiar'?null:nickname,`Cambio solicitado por ${i.user.tag}`);
      await log(i.guild,'Apodo cambiado',`${i.user.tag} cambió el apodo de ${user.tag} a ${nickname}`);
      return i.reply({content:'✅ Apodo actualizado.',ephemeral:true});
    }
    if (cmd==='lock'||cmd==='unlock') {
      const ch=i.options.getChannel('canal')||i.channel;
      if (!ch.permissionOverwrites) return replyErr(i,'Ese canal no permite bloquear mensajes.');
      await ch.permissionOverwrites.edit(i.guild.roles.everyone.id,{SendMessages:cmd==='unlock'?null:false});
      await log(i.guild,cmd==='lock'?'Canal bloqueado':'Canal desbloqueado',`${i.user.tag} ejecutó /${cmd} en ${ch}.`);
      return i.reply(`🔒 ${ch} ${cmd==='lock'?'bloqueado':'desbloqueado'}.`);
    }
    if (cmd==='slowmode') {
      const seconds=i.options.getInteger('segundos'); await i.channel.setRateLimitPerUser(seconds);
      return i.reply({content:`⏱️ Modo lento configurado a ${seconds} segundos.`,ephemeral:true});
    }
    if (cmd==='userinfo') {
      const user=i.options.getUser('usuario')||i.user, member=await i.guild.members.fetch(user.id).catch(()=>null);
      const embed=new EmbedBuilder().setColor(0xE84393).setTitle(`Usuario: ${user.tag}`).setThumbnail(user.displayAvatarURL()).addFields({name:'ID',value:user.id},{name:'Cuenta creada',value:`<t:${Math.floor(user.createdTimestamp/1000)}:F>`});
      if(member) embed.addFields({name:'Entró al servidor',value:member.joinedTimestamp?`<t:${Math.floor(member.joinedTimestamp/1000)}:F>`:'Desconocido'},{name:'Roles',value:member.roles.cache.filter(r=>r.id!==i.guild.id).map(r=>r.toString()).slice(0,15).join(', ')||'Ninguno'});
      return i.reply({embeds:[embed],ephemeral:true});
    }
    if (cmd==='serverinfo') {
      const g=i.guild;
      return i.reply({embeds:[new EmbedBuilder().setColor(0xE84393).setTitle(g.name).setThumbnail(g.iconURL()).addFields({name:'ID',value:g.id},{name:'Miembros',value:String(g.memberCount),inline:true},{name:'Canales',value:String(g.channels.cache.size),inline:true},{name:'Creado',value:`<t:${Math.floor(g.createdTimestamp/1000)}:D>`})]});
    }
    if (cmd==='poll') {
      const q=i.options.getString('pregunta'), a=i.options.getString('opcion_a'), b=i.options.getString('opcion_b'), db=readDB(), id=Date.now();
      db.polls.push({id,guildId:i.guildId,channelId:i.channelId,creatorId:i.user.id,question:q,options:[a,b],votes:{},createdAt:new Date().toISOString()}); writeDB(db);
      const embed=new EmbedBuilder().setColor(0xE84393).setTitle(`📊 ${q}`).setDescription(`🇦 **${a}**\n🇧 **${b}**`).setFooter({text:`Encuesta ID ${id} · Un voto por persona`});
      const row=new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId(`poll_${id}_a`).setLabel('Votar A').setStyle(ButtonStyle.Primary),new ButtonBuilder().setCustomId(`poll_${id}_b`).setLabel('Votar B').setStyle(ButtonStyle.Secondary));
      await i.channel.send({embeds:[embed],components:[row]}); return i.reply({content:'Encuesta publicada.',ephemeral:true});
    }
    if (cmd==='suggest') {
      const idea=i.options.getString('idea'), db=readDB(), id=(db.suggestions.reduce((m,s)=>Math.max(m,s.id),0)||0)+1;
      const suggestion={id,guildId:i.guildId,userId:i.user.id,idea,status:'Pendiente',createdAt:new Date().toISOString()}; db.suggestions.push(suggestion); writeDB(db);
      const chId=process.env.SUGGESTIONS_CHANNEL_ID, ch=chId?await i.guild.channels.fetch(chId).catch(()=>null):i.channel;
      if(!ch?.isTextBased()) return i.reply({content:`Sugerencia guardada como #${id}, pero falta configurar un canal de sugerencias.`,ephemeral:true});
      const embed=new EmbedBuilder().setColor(0xE84393).setTitle(`💡 Sugerencia #${id}`).setDescription(idea).addFields({name:'Enviada por',value:i.user.tag},{name:'Estado',value:'Pendiente'}).setTimestamp();
      const row=new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId(`suggest_${id}_approve`).setLabel('Aprobar').setStyle(ButtonStyle.Success),new ButtonBuilder().setCustomId(`suggest_${id}_reject`).setLabel('Rechazar').setStyle(ButtonStyle.Danger));
      await ch.send({embeds:[embed],components:[row]}); return i.reply({content:`¡Gracias! Tu sugerencia #${id} fue enviada.`,ephemeral:true});
    }
    if (cmd==='suggestionstatus') {
      if(!needStaff(i)) return replyErr(i,'Solo el staff puede cambiar el estado.');
      const id=i.options.getInteger('numero'), status=i.options.getString('estado'), note=i.options.getString('nota');
      const db=readDB(), s=db.suggestions.find(x=>x.id===id && x.guildId===i.guildId);
      if(!s) return replyErr(i,'No existe esa sugerencia.');
      s.status=status; s.reviewedBy=i.user.id; s.note=note||''; writeDB(db);
      return i.reply({content:`Sugerencia #${id}: **${status}**${note?`\nNota: ${note}`:''}`,ephemeral:true});
    }
    if (cmd==='giveaway') {
      const prize=i.options.getString('premio'), minutes=i.options.getInteger('minutos'), endAt=Date.now()+minutes*60000;
      const db=readDB(), id=Date.now(), embed=new EmbedBuilder().setColor(0xE84393).setTitle('🎉 SORTEO AURENRP').setDescription(`**Premio:** ${prize}\nPulsa 🎉 Participar para entrar.\nTermina: <t:${Math.floor(endAt/1000)}:R>`).setFooter({text:`Sorteo ${id}`});
      const row=new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId(`gw_PENDING_${id}`).setLabel('🎉 Participar').setStyle(ButtonStyle.Success));
      const msg=await i.channel.send({embeds:[embed],components:[row]});
      db.giveaways.push({id,guildId:i.guildId,channelId:i.channelId,messageId:msg.id,prize,endAt,entries:[],ended:false,hostId:i.user.id}); writeDB(db);
      // Button custom ID is updated to the message ID to simplify reliable lookup.
      await msg.edit({components:[new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId(`gw_${msg.id}`).setLabel('🎉 Participar').setStyle(ButtonStyle.Success))]});
      return i.reply({content:`Sorteo publicado. Finalízalo con /endgiveaway mensaje_id:${msg.id} cuando termine. El temporizador es informativo; el sorteo se cierra con ese comando.`,ephemeral:true});
    }
    if (cmd==='endgiveaway') {
      if(!needStaff(i)) return replyErr(i,'Solo el staff puede finalizar sorteos.');
      const msgId=i.options.getString('mensaje_id'), db=readDB(), g=db.giveaways.find(x=>x.messageId===msgId && !x.ended);
      if(!g) return replyErr(i,'No encontré un sorteo activo con ese mensaje ID.');
      g.ended=true; writeDB(db);
      const winner=g.entries.length?g.entries[Math.floor(Math.random()*g.entries.length)]:null;
      const ch=await i.guild.channels.fetch(g.channelId).catch(()=>null), msg=ch?.isTextBased()?await ch.messages.fetch(g.messageId).catch(()=>null):null;
      if(msg) await msg.edit({components:[],embeds:[EmbedBuilder.from(msg.embeds[0]).setTitle('🎉 SORTEO FINALIZADO').setDescription(`**Premio:** ${g.prize}\n**Participantes:** ${g.entries.length}\n**Ganador:** ${winner?`<@${winner}>`:'No hubo participantes'}`)]});
      await log(i.guild,'Sorteo finalizado',`Premio: ${g.prize}\nGanador: ${winner?`<@${winner}>`:'Nadie'}\nFinalizado por: ${i.user.tag}`);
      return i.reply(`Sorteo finalizado. Ganador: ${winner?`<@${winner}>`:'no hubo participantes'}.`);
    }
  } catch (e) {
    console.error(`Error en /${cmd}:`,e);
    return replyErr(i,`No pude completar /${cmd}. Comprueba permisos del bot y jerarquía de roles.`);
  }
});

const spam = new Map();
client.on(Events.MessageCreate, async message => {
  if (!message.guild || message.author.bot || !message.member) return;
  const limit=Math.max(3,Number(process.env.SPAM_LIMIT)||6), windowMs=Math.max(2000,Number(process.env.SPAM_WINDOW_MS)||7000);
  const now=Date.now(), key=`${message.guild.id}:${message.author.id}`, arr=(spam.get(key)||[]).filter(t=>now-t<windowMs);
  arr.push(now); spam.set(key,arr);
  if (arr.length>=limit && !isTrustedForSpam(message.member)) {
    spam.delete(key);
    const minutes=Math.max(1,Number(process.env.TIMEOUT_MINUTES)||5);
    await message.member.timeout(minutes*60000,'AutoMod: spam/flood detectado').catch(()=>{});
    await message.channel.send({content:`⚠️ ${message.author}, se detectó spam. Se aplicó una pausa automática.`}).catch(()=>{});
    await log(message.guild,'AutoMod: spam detectado',`Usuario: ${message.author.tag}\nCanal: ${message.channel}\nMensajes en ventana: ${arr.length}\nTimeout solicitado: ${minutes} minutos`,0xE74C3C);
  }
});
function isTrustedForSpam(member) {
  return member.permissions.has(PermissionFlagsBits.Administrator) ||
    member.permissions.has(PermissionFlagsBits.ManageMessages) ||
    hasRole(member,adminRoles) || hasRole(member,staffRoles);
}
client.on(Events.MessageDelete, async m => {
  if (!m.guild || m.author?.bot) return;
  await log(m.guild,'Mensaje eliminado',`Canal: ${m.channel}\nAutor: ${m.author?.tag||'Desconocido'}\nContenido: ${(m.content||'[sin contenido o no estaba en caché]').slice(0,1500)}`);
});
client.on(Events.MessageUpdate, async (oldM,newM) => {
  if (!newM.guild || newM.author?.bot || oldM.content===newM.content) return;
  await log(newM.guild,'Mensaje editado',`Canal: ${newM.channel}\nAutor: ${newM.author?.tag||'Desconocido'}\nAntes: ${(oldM.content||'[no disponible]').slice(0,900)}\nDespués: ${(newM.content||'[vacío]').slice(0,900)}`);
});
client.on(Events.GuildMemberAdd, m => log(m.guild,'Miembro entró',`${m.user.tag} (${m.id})`));
client.on(Events.GuildMemberRemove, m => log(m.guild,'Miembro salió',`${m.user.tag} (${m.id})`));
client.on(Events.GuildMemberUpdate, async (oldM,newM) => {
  if(oldM.nickname!==newM.nickname) await log(newM.guild,'Apodo cambiado',`${newM.user.tag}: ${oldM.nickname||'sin apodo'} → ${newM.nickname||'sin apodo'}`);
  const before=oldM.roles.cache.map(r=>r.id).sort().join(','), after=newM.roles.cache.map(r=>r.id).sort().join(',');
  if(before!==after) await log(newM.guild,'Roles actualizados',`Miembro: ${newM.user.tag}\nAntes: ${oldM.roles.cache.filter(r=>r.id!==newM.guild.id).map(r=>r.name).join(', ')||'ninguno'}\nAhora: ${newM.roles.cache.filter(r=>r.id!==newM.guild.id).map(r=>r.name).join(', ')||'ninguno'}`);
});
client.on(Events.GuildBanAdd, b => log(b.guild,'Usuario baneado',`${b.user.tag} (${b.user.id})`,0xE74C3C));
client.on(Events.GuildBanRemove, b => log(b.guild,'Baneo retirado',`${b.user.tag} (${b.user.id})`));

(async()=>{
  try {
    const rest=new REST({version:'10'}).setToken(TOKEN);
    await rest.put(Routes.applicationGuildCommands(CLIENT_ID,GUILD_ID),{body:commands.map(c=>c.toJSON())});
    console.log(`Registrados ${commands.length} comandos en el servidor ${GUILD_ID}.`);
  } catch(e) { console.error('No se pudieron registrar comandos automáticamente:',e.message); }
  await client.login(TOKEN);
})();
