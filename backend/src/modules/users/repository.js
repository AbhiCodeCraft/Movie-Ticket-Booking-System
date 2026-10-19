export const publicColumns = 'user_id,name,email,phone_no,role';
export const usersRepository = db => ({
  async byId(id) { return (await db.query(`SELECT ${publicColumns} FROM users WHERE user_id=$1`, [id])).rows[0]; },
  async byEmail(email) { return (await db.query('SELECT * FROM users WHERE email=$1', [email])).rows[0]; },
  async create({ name, email, phone_no, password_hash }) {
    return (await db.query(`INSERT INTO users(name,email,phone_no,password_hash) VALUES($1,$2,$3,$4) RETURNING ${publicColumns}`, [name,email,phone_no ?? null,password_hash])).rows[0];
  },
});
