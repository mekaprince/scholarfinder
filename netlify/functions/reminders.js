const { neon } = require('@neondatabase/serverless');
const { runReminders } = require('./reminders_lib'), mailer = require('./mailer');
exports.handler = async () => {
  const sql = (q, p = []) => neon(process.env.DATABASE_URL).query(q, p);
  console.log(JSON.stringify(await runReminders(sql, mailer)));
  return { statusCode: 200 };
};
