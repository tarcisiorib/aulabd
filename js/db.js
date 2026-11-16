const DB = (() => {
  const { url, anonKey } = window.SUPABASE_CONFIG;
  const sb = window.supabase.createClient(url, anonKey, { auth: { persistSession: false } });

  const PK = { clientes: 'cliente_id', tecnicos: 'tecnico_id', ordens_servico: 'ordem_servico_id' };

  const unwrap = ({ data, error }) => {
    if (error) {
      throw new Error(error.message);
    }
    return data;
  };

  return {
    async select(table) {
      return unwrap(await sb.from(table).select('*').order(PK[table]));
    },
    async insert(table, row) {
      return unwrap(await sb.from(table).insert(row).select().single());
    },
    async update(table, id, changes) {
      const rows = unwrap(await sb.from(table).update(changes).eq(PK[table], id).select());
      if (!rows.length) throw new Error('Sem permissão ou registo inexistente');
      return rows[0];
    },
  };
})();