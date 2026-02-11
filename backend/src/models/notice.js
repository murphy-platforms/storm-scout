/**
 * Notice Model - MySQL/MariaDB
 * Data access layer for notices table  
 */

const { getDatabase } = require('../config/database');

const NoticeModel = {
  async getAll(filters = {}) {
    const db = await getDatabase();
    let query = 'SELECT * FROM notices WHERE 1=1';
    const params = [];
    
    if (filters.jurisdiction_type) {
      query += ' AND jurisdiction_type = ?';
      params.push(filters.jurisdiction_type);
    }
    
    if (filters.notice_type) {
      query += ' AND notice_type = ?';
      params.push(filters.notice_type);
    }
    
    if (filters.state) {
      query += ' AND jurisdiction = ?';
      params.push(filters.state);
    }
    
    query += ' ORDER BY effective_time DESC';
    
    try {
      const [rows] = await db.query(query, params);
      return rows;
    } catch (error) {
      console.error('Error fetching notices:', error);
      return [];
    }
  },

  async getActive(filters = {}) {
    const db = await getDatabase();
    const now = new Date().toISOString().slice(0, 19).replace('T', ' ');
    let query = 'SELECT * FROM notices WHERE effective_time <= ? AND (expiration_time IS NULL OR expiration_time > ?)';
    const params = [now, now];
    
    if (filters.jurisdiction_type) {
      query += ' AND jurisdiction_type = ?';
      params.push(filters.jurisdiction_type);
    }
    
    if (filters.state) {
      query += ' AND jurisdiction = ?';
      params.push(filters.state);
    }
    
    query += ' ORDER BY effective_time DESC';
    
    try {
      const [rows] = await db.query(query, params);
      return rows;
    } catch (error) {
      console.error('Error fetching active notices:', error);
      return [];
    }
  },

  async getById(id) {
    const db = await getDatabase();
    try {
      const [rows] = await db.query('SELECT * FROM notices WHERE id = ?', [id]);
      return rows[0] || null;
    } catch (error) {
      console.error('Error fetching notice by ID:', error);
      return null;
    }
  },

  async getCountByType(activeOnly = true) {
    const db = await getDatabase();
    let query = 'SELECT notice_type, COUNT(*) as count FROM notices';
    
    if (activeOnly) {
      const now = new Date().toISOString().slice(0, 19).replace('T', ' ');
      query += ' WHERE effective_time <= ? AND (expiration_time IS NULL OR expiration_time > ?)';
    }
    
    query += ' GROUP BY notice_type ORDER BY count DESC';
    
    try {
      if (activeOnly) {
        const now = new Date().toISOString().slice(0, 19).replace('T', ' ');
        const [rows] = await db.query(query, [now, now]);
        return rows;
      } else {
        const [rows] = await db.query(query);
        return rows;
      }
    } catch (error) {
      console.error('Error counting by type:', error);
      return [];
    }
  }
};

module.exports = NoticeModel;
