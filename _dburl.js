/* Helper: tentukan databaseURL RTDB.
   Prioritas: env AQUENT_DB_URL > default region us > asia-southeast1.
   Dipakai oleh setup-admin.js & seed-demo-data.js */
module.exports = function getDatabaseURL(projectId) {
  if (process.env.AQUENT_DB_URL) return process.env.AQUENT_DB_URL;
  return `https://${projectId}-default-rtdb.firebaseio.com`;
};
