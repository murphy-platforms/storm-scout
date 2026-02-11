/**
 * Notice Model (MySQL Stub)
 */

const { getDatabase } = require('../config/database');

const NoticeModel = {
  async getAll(filters = {}) {
    try {
      const db = await getDatabase();
      const [rows] = await db.query('SELECT * FROM notices ORDER BY effective_time DESC');
      return rows;
    } catch (error) {
      console.error('Error fetching notices:', error);
      return [];
    }
  }
};

module.exports = NoticeModel;
