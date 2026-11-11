const DB = (() => {
  const { url, anonKey } = window.SUPABASE_CONFIG;
  const sb = window.supabase.createClient(url, anonKey, { auth: { persistSession: false } });

  const PK = { clientes: 'cliente_id', tecnicos: 'tecnico_id', ordens_servico: 'ordem_servico_id' };

  const unwrap = ({ data, error }) => {
    if (error) {
      if (error.code === '42501') throw new Error('Sem permissão (verifique supabase/03_policies.sql)');
      if (error.code === '23505') throw new Error('Registo duplicado (ex.: CPF já existe)');
      if (error.code === '23503') throw new Error('Cliente ou técnico inexistente (FOREIGN KEY)');
      throw new Error(error.message);
    }
    return data;
  };

  // CRUD sem DELETE, como no 03_DCL.sql
  return {
    async select(table) {
      return unwrap(await sb.from(table).select('*').order(PK[table]));
    },
    async insert(table, row) {
      return unwrap(await sb.from(table).insert(row).select().single());
    },
    async update(table, id, changes) {
      const rows = unwrap(await sb.from(table).update(changes).eq(PK[table], id).select());
      // Com RLS, um UPDATE bloqueado devolve 0 linhas em vez de erro
      if (!rows.length) throw new Error('Sem permissão ou registo inexistente');
      return rows[0];
    },
  };
})();
