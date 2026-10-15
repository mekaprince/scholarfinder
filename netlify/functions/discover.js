const { neon } = require('@neondatabase/serverless');
const { runDiscovery } = require('./discover_lib');
exports.handler = async () => {
  const sql = (q, p=[]) => neon(process.env.DATABASE_URL).query(q, p);
  console.log(JSON.stringify(await runDiscovery(sql, fetch, 3)));
  return { statusCode: 200 };
};
