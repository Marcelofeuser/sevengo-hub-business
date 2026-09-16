import type { Perfil } from "./middleware.js";

/**
 * Substitui a RLS do Supabase: consultor tem acesso total, cliente só
 * enxerga a própria empresa_id. Toda query em cima de uma tabela
 * empresa_id-scoped passa por aqui antes de tocar o banco.
 */
export function empresaFilter(perfil: Perfil): { where: string; params: unknown[] } {
  if (perfil.role === "consultor") {
    return { where: "true", params: [] };
  }
  if (!perfil.empresa_id) {
    // Cliente sem empresa_id vinculada não deveria existir, mas se
    // acontecer, o resultado tem que ser "nada", nunca "tudo".
    return { where: "false", params: [] };
  }
  return { where: "empresa_id = $1", params: [perfil.empresa_id] };
}

export function canAccessEmpresa(perfil: Perfil, empresaId: string): boolean {
  if (perfil.role === "consultor") return true;
  return perfil.empresa_id === empresaId;
}
