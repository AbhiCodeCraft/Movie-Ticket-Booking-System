export async function transaction(pool, work) {
  const client = await pool.connect();
  let broken = false;
  try {
    await client.query('BEGIN');
    const result = await work(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    try { await client.query('ROLLBACK'); }
    catch { broken = true; } // Preserve the original failure; discard unusable connections.
    throw error;
  }
  finally { client.release(broken); }
}
