const { neon } = require('@neondatabase/serverless');
const C = require('./controllers'), AI = require('./ai_extract');
exports.handler = async () => {
  const sql = (q, p = []) => neon(process.env.DATABASE_URL).query(q, p);
  console.log(JSON.stringify(await C.processBatch(sql, AI.extract, AI.enabled)));
  return { statusCode: 200 };
};
