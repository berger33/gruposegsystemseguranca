"use client";
import UiTaskWorkspace from "@/components/ui/UiTaskWorkspace";
import UiTableScroll from "@/components/ui/UiTableScroll";

import { useEffect, useState } from "react";

type Tab = "produtos" | "reservas" | "ativos" | "requisicoes" | "os" | "inventarios";

interface Product {
  id: string;
  sku: string;
  name: string;
  category: string;
  unit_measure: string;
  stock_current: number;
  stock_min: number;
  location?: string;
}

interface Reservation {
  id: string;
  product_id: string;
  product_name?: string;
  quantity: number;
  reservation_type: string;
  reference_type: string;
  reference_id: string;
  status: string;
}

interface Asset {
  id: string;
  product_name?: string;
  serial_number: string;
  owner_name: string;
  owner_type: string;
  status: string;
  warranty_until?: string;
}

interface Requisition {
  id: string;
  protocol: string;
  product_name?: string;
  quantity: number;
  requester_name: string;
  urgency: string;
  status: string;
  reason: string;
}

interface ServiceOrder {
  id: string;
  protocol: string;
  title: string;
  requester_name: string;
  technician_name?: string;
  priority: string;
  status: string;
  diagnosis?: string;
}

interface Inventory {
  id: string;
  protocol: string;
  title: string;
  location: string;
  status: string;
}

export default function PatrimonioWorkspace() {
  const [activeTab, setActiveTab] = useState<Tab>("produtos");
  const [products, setProducts] = useState<Product[]>([]);
  const [reservations, setReservations] = useState<Reservation[]>([]);
  const [assets, setAssets] = useState<Asset[]>([]);
  const [requisitions, setRequisitions] = useState<Requisition[]>([]);
  const [serviceOrders, setServiceOrders] = useState<ServiceOrder[]>([]);
  const [inventories, setInventories] = useState<Inventory[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadData(activeTab);
  }, [activeTab]);

  async function loadData(tab: Tab) {
    setLoading(true);
    setError(null);
    try {
      if (tab === "produtos") {
        const res = await fetch("/api/ast/products", { credentials: "same-origin" });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        setProducts(data.items || []);
      } else if (tab === "reservas") {
        const res = await fetch("/api/ast/reservations", { credentials: "same-origin" });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        setReservations(data.items || []);
      } else if (tab === "ativos") {
        const res = await fetch("/api/ast/serialized-assets", { credentials: "same-origin" });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        setAssets(data.items || []);
      } else if (tab === "requisicoes") {
        const res = await fetch("/api/ast/requisitions", { credentials: "same-origin" });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        setRequisitions(data.items || []);
      } else if (tab === "os") {
        const res = await fetch("/api/ast/service-orders", { credentials: "same-origin" });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        setServiceOrders(data.items || []);
      } else if (tab === "inventarios") {
        const res = await fetch("/api/ast/inventories", { credentials: "same-origin" });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        setInventories(data.items || []);
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Erro ao carregar dados de patrimônio");
    } finally {
      setLoading(false);
    }
  }

  return (
    <UiTaskWorkspace className="p-6 max-w-7xl mx-auto space-y-6">
      <div className="border-b pb-4">
        <h1 className="text-2xl font-bold tracking-tight text-gray-900">Patrimônio, Almoxarifado e Ativos</h1>
        <p className="text-sm text-gray-500 mt-1">
          Gestão transacional de estoque, reservas operacionais, ativos serializados, ordens de serviço, manutenção e requisições internas sintéticas.
        </p>
      </div>

      <div className="flex space-x-2 border-b">
        {(
          [
            ["produtos", "Produtos & Estoque"],
            ["reservas", "Reservas Operacionais"],
            ["ativos", "Ativos Serializados"],
            ["os", "Ordens de Serviço (OS)"],
            ["inventarios", "Inventários Físicos"],
            ["requisicoes", "Requisições Internas"],
          ] as const
        ).map(([tabKey, label]) => (
          <button
            key={tabKey}
            onClick={() => setActiveTab(tabKey)}
            className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
              activeTab === tabKey
                ? "border-blue-600 text-blue-600"
                : "border-transparent text-gray-500 hover:text-gray-700"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {loading && <div className="p-4 text-sm text-gray-500">Carregando dados...</div>}
      {error && <div className="p-4 text-sm text-red-600 bg-red-50 rounded">Erro: {error}</div>}

      {!loading && !error && activeTab === "produtos" && (
        <div className="space-y-4">
          <div className="flex justify-between items-center">
            <h2 className="text-lg font-semibold">Itens em Catálogo e Estoque</h2>
          </div>
          {products.length === 0 ? (
            <div className="p-8 text-center text-gray-500 border rounded">Nenhum produto cadastrado no almoxarifado.</div>
          ) : (
            <div className="overflow-x-auto border rounded-lg">
              <UiTableScroll><table className="min-w-full divide-y divide-gray-200 text-sm">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-4 py-3 text-left font-medium text-gray-500">SKU</th>
                    <th className="px-4 py-3 text-left font-medium text-gray-500">Produto</th>
                    <th className="px-4 py-3 text-left font-medium text-gray-500">Categoria</th>
                    <th className="px-4 py-3 text-left font-medium text-gray-500">Unidade</th>
                    <th className="px-4 py-3 text-left font-medium text-gray-500">Estoque Atual</th>
                    <th className="px-4 py-3 text-left font-medium text-gray-500">Estoque Mínimo</th>
                    <th className="px-4 py-3 text-left font-medium text-gray-500">Localização</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200 bg-white">
                  {products.map((p) => (
                    <tr key={p.id}>
                      <td className="px-4 py-3 font-mono font-medium text-gray-900">{p.sku}</td>
                      <td className="px-4 py-3 text-gray-800">{p.name}</td>
                      <td className="px-4 py-3 text-gray-600">{p.category}</td>
                      <td className="px-4 py-3 text-gray-600">{p.unit_measure}</td>
                      <td className="px-4 py-3 font-semibold text-gray-900">{p.stock_current}</td>
                      <td className="px-4 py-3 text-gray-500">{p.stock_min}</td>
                      <td className="px-4 py-3 text-gray-500">{p.location || "Central"}</td>
                    </tr>
                  ))}
                </tbody>
              </table></UiTableScroll>
            </div>
          )}
        </div>
      )}

      {!loading && !error && activeTab === "reservas" && (
        <div className="space-y-4">
          <div className="flex justify-between items-center">
            <h2 className="text-lg font-semibold">Reservas de Estoque para Implantação / Proposta</h2>
          </div>
          {reservations.length === 0 ? (
            <div className="p-8 text-center text-gray-500 border rounded">Nenhuma reserva ativa no momento.</div>
          ) : (
            <div className="overflow-x-auto border rounded-lg">
              <UiTableScroll><table className="min-w-full divide-y divide-gray-200 text-sm">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-4 py-3 text-left font-medium text-gray-500">Produto</th>
                    <th className="px-4 py-3 text-left font-medium text-gray-500">Qtd Reservada</th>
                    <th className="px-4 py-3 text-left font-medium text-gray-500">Tipo Reserva</th>
                    <th className="px-4 py-3 text-left font-medium text-gray-500">Referência</th>
                    <th className="px-4 py-3 text-left font-medium text-gray-500">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200 bg-white">
                  {reservations.map((r) => (
                    <tr key={r.id}>
                      <td className="px-4 py-3 font-medium text-gray-900">{r.product_name || r.product_id}</td>
                      <td className="px-4 py-3 font-semibold text-gray-800">{r.quantity}</td>
                      <td className="px-4 py-3 text-gray-600 capitalize">{r.reservation_type}</td>
                      <td className="px-4 py-3 text-gray-500">{r.reference_type} #{r.reference_id}</td>
                      <td className="px-4 py-3">
                        <span className="px-2 py-1 rounded text-xs font-medium bg-blue-100 text-blue-800">
                          {r.status}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table></UiTableScroll>
            </div>
          )}
        </div>
      )}

      {!loading && !error && activeTab === "ativos" && (
        <div className="space-y-4">
          <div className="flex justify-between items-center">
            <h2 className="text-lg font-semibold">Equipamentos e Ativos Serializados</h2>
          </div>
          {assets.length === 0 ? (
            <div className="p-8 text-center text-gray-500 border rounded">Nenhum ativo serializado cadastrado.</div>
          ) : (
            <div className="overflow-x-auto border rounded-lg">
              <UiTableScroll><table className="min-w-full divide-y divide-gray-200 text-sm">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-4 py-3 text-left font-medium text-gray-500">Número de Série</th>
                    <th className="px-4 py-3 text-left font-medium text-gray-500">Item</th>
                    <th className="px-4 py-3 text-left font-medium text-gray-500">Custodiante / Titular</th>
                    <th className="px-4 py-3 text-left font-medium text-gray-500">Garantia</th>
                    <th className="px-4 py-3 text-left font-medium text-gray-500">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200 bg-white">
                  {assets.map((a) => (
                    <tr key={a.id}>
                      <td className="px-4 py-3 font-mono font-medium text-gray-900">{a.serial_number}</td>
                      <td className="px-4 py-3 text-gray-800">{a.product_name || "Equipamento"}</td>
                      <td className="px-4 py-3 text-gray-600">{a.owner_name} ({a.owner_type})</td>
                      <td className="px-4 py-3 text-gray-500">{a.warranty_until ? new Date(a.warranty_until).toLocaleDateString() : "N/A"}</td>
                      <td className="px-4 py-3">
                        <span className="px-2 py-1 rounded text-xs font-medium bg-gray-100 text-gray-800">
                          {a.status}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table></UiTableScroll>
            </div>
          )}
        </div>
      )}

      {!loading && !error && activeTab === "os" && (
        <div className="space-y-4">
          <div className="flex justify-between items-center">
            <h2 className="text-lg font-semibold">Ordens de Serviço (OS) & Manutenção</h2>
          </div>
          {serviceOrders.length === 0 ? (
            <div className="p-8 text-center text-gray-500 border rounded">Nenhuma ordem de serviço cadastrada.</div>
          ) : (
            <div className="overflow-x-auto border rounded-lg">
              <UiTableScroll><table className="min-w-full divide-y divide-gray-200 text-sm">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-4 py-3 text-left font-medium text-gray-500">Protocolo</th>
                    <th className="px-4 py-3 text-left font-medium text-gray-500">Título</th>
                    <th className="px-4 py-3 text-left font-medium text-gray-500">Solicitante</th>
                    <th className="px-4 py-3 text-left font-medium text-gray-500">Técnico</th>
                    <th className="px-4 py-3 text-left font-medium text-gray-500">Prioridade</th>
                    <th className="px-4 py-3 text-left font-medium text-gray-500">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200 bg-white">
                  {serviceOrders.map((so) => (
                    <tr key={so.id}>
                      <td className="px-4 py-3 font-mono font-medium text-gray-900">{so.protocol}</td>
                      <td className="px-4 py-3 text-gray-800">{so.title}</td>
                      <td className="px-4 py-3 text-gray-600">{so.requester_name}</td>
                      <td className="px-4 py-3 text-gray-600">{so.technician_name || "A designar"}</td>
                      <td className="px-4 py-3">
                        <span className="px-2 py-1 rounded text-xs font-medium bg-orange-100 text-orange-800 uppercase">
                          {so.priority}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <span className="px-2 py-1 rounded text-xs font-medium bg-gray-100 text-gray-800">
                          {so.status}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table></UiTableScroll>
            </div>
          )}
        </div>
      )}

      {!loading && !error && activeTab === "inventarios" && (
        <div className="space-y-4">
          <div className="flex justify-between items-center">
            <h2 className="text-lg font-semibold">Inventários Físicos e Ajustes</h2>
          </div>
          {inventories.length === 0 ? (
            <div className="p-8 text-center text-gray-500 border rounded">Nenhum inventário cadastrado.</div>
          ) : (
            <div className="overflow-x-auto border rounded-lg">
              <UiTableScroll><table className="min-w-full divide-y divide-gray-200 text-sm">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-4 py-3 text-left font-medium text-gray-500">Protocolo</th>
                    <th className="px-4 py-3 text-left font-medium text-gray-500">Título</th>
                    <th className="px-4 py-3 text-left font-medium text-gray-500">Localização</th>
                    <th className="px-4 py-3 text-left font-medium text-gray-500">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200 bg-white">
                  {inventories.map((inv) => (
                    <tr key={inv.id}>
                      <td className="px-4 py-3 font-mono font-medium text-gray-900">{inv.protocol}</td>
                      <td className="px-4 py-3 text-gray-800">{inv.title}</td>
                      <td className="px-4 py-3 text-gray-600">{inv.location}</td>
                      <td className="px-4 py-3">
                        <span className="px-2 py-1 rounded text-xs font-medium bg-blue-100 text-blue-800">
                          {inv.status}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table></UiTableScroll>
            </div>
          )}
        </div>
      )}

      {!loading && !error && activeTab === "requisicoes" && (
        <div className="space-y-4">
          <div className="flex justify-between items-center">
            <h2 className="text-lg font-semibold">Requisições Internas de Materiais</h2>
            <span className="text-xs bg-amber-50 text-amber-700 px-2 py-1 rounded border border-amber-200 font-medium">
              Fluxo Sintético Interno (Sem compras ou pagamentos reais externos)
            </span>
          </div>
          {requisitions.length === 0 ? (
            <div className="p-8 text-center text-gray-500 border rounded">Nenhuma requisição registrada.</div>
          ) : (
            <div className="overflow-x-auto border rounded-lg">
              <UiTableScroll><table className="min-w-full divide-y divide-gray-200 text-sm">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-4 py-3 text-left font-medium text-gray-500">Protocolo</th>
                    <th className="px-4 py-3 text-left font-medium text-gray-500">Item</th>
                    <th className="px-4 py-3 text-left font-medium text-gray-500">Qtd</th>
                    <th className="px-4 py-3 text-left font-medium text-gray-500">Solicitante</th>
                    <th className="px-4 py-3 text-left font-medium text-gray-500">Urgência</th>
                    <th className="px-4 py-3 text-left font-medium text-gray-500">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200 bg-white">
                  {requisitions.map((reqItem) => (
                    <tr key={reqItem.id}>
                      <td className="px-4 py-3 font-mono font-medium text-gray-900">{reqItem.protocol}</td>
                      <td className="px-4 py-3 text-gray-800">{reqItem.product_name || "Material"}</td>
                      <td className="px-4 py-3 font-semibold text-gray-900">{reqItem.quantity}</td>
                      <td className="px-4 py-3 text-gray-600">{reqItem.requester_name}</td>
                      <td className="px-4 py-3">
                        <span className="px-2 py-1 rounded text-xs font-medium bg-yellow-100 text-yellow-800 uppercase">
                          {reqItem.urgency}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <span className="px-2 py-1 rounded text-xs font-medium bg-gray-100 text-gray-800">
                          {reqItem.status}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table></UiTableScroll>
            </div>
          )}
        </div>
      )}
    </UiTaskWorkspace>
  );
}
