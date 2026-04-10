import { DataSource } from 'typeorm';

async function verify() {
  const ds = new DataSource({
    type: 'postgres',
    url: process.env.DATABASE_URL || 'postgresql://enkap_admin:localdev_only@localhost:5432/enkap_control_plane?sslmode=disable',
  });

  try {
    await ds.initialize();
    const schema = 't_00000000_0000_0000_0000_000000000001';
    
    const tables = [
        'invoices', 'crm_leads', 'employees', 'vehicles', 'trips', 
        'work_orders', 'projects', 'fixed_assets', 'budgets', 
        'notifications', 'stock_movements', 'treasury_transactions',
        'payrolls', 'expense_reports', 'crm_activities'
    ];

    console.log('--- Seeding Verifikasyonu ---');
    for (const table of tables) {
        try {
            const res = await ds.query(`SELECT COUNT(*) as count FROM "${schema}"."${table}"`);
            console.log(`${table.padEnd(25)}: ${res[0].count}`);
        } catch (e) {
            console.log(`${table.padEnd(25)}: HATA (${(e as Error).message})`);
        }
    }

  } finally {
    await ds.destroy();
  }
}

verify();
