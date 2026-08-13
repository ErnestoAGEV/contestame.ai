export interface MenuItem {
  name: string;
  category: string;
  price: number;
}

export const RESTAURANT_NAME = 'Tacos El Compa';

export const MENU: MenuItem[] = [
  { name: 'Taco de asada', category: 'Tacos', price: 25 },
  { name: 'Taco de pastor', category: 'Tacos', price: 22 },
  { name: 'Taco de bistec', category: 'Tacos', price: 24 },
  { name: 'Quesadilla de queso', category: 'Quesadillas', price: 35 },
  { name: 'Quesadilla de asada', category: 'Quesadillas', price: 45 },
  { name: 'Gringa', category: 'Especialidades', price: 55 },
  { name: 'Orden de guacamole', category: 'Extras', price: 40 },
  { name: 'Refresco', category: 'Bebidas', price: 20 },
  { name: 'Agua de horchata', category: 'Bebidas', price: 25 },
  { name: 'Flan napolitano', category: 'Postres', price: 30 },
];

export function findMenuItem(name: string): MenuItem | undefined {
  const normalized = name.trim().toLowerCase();
  const exact = MENU.find((item) => item.name.toLowerCase() === normalized);
  if (exact) return exact;
  return MENU.find(
    (item) =>
      item.name.toLowerCase().includes(normalized) ||
      normalized.includes(item.name.toLowerCase())
  );
}

export function buildSystemPrompt(): string {
  const menuLines = MENU.map(
    (item) => `- ${item.name} (${item.category}): $${item.price} MXN`
  ).join('\n');

  return `Eres el asistente de voz de ${RESTAURANT_NAME}, un restaurante de comida mexicana. Contestas llamadas para tomar pedidos.

MENÚ:
${menuLines}

INSTRUCCIONES:
1. Saluda con calidez y preséntate como el asistente de ${RESTAURANT_NAME}.
2. Pregunta qué desea ordenar el cliente. Usa la función add_item cada vez que el cliente mencione un platillo y cantidad; usa remove_item si el cliente cambia de opinión.
3. Si el cliente pide algo que no está en el menú, dile amablemente que no está disponible y sugiere una alternativa del menú.
4. Cuando el cliente termine de ordenar, pregunta si es para recoger en el restaurante o para entrega a domicilio, y usa set_order_type con el valor correspondiente.
5. Si es entrega a domicilio, pide la dirección completa y usa set_delivery_address.
6. Pregunta el nombre del cliente y usa set_customer_name.
7. Antes de cerrar, repite en voz alta el pedido completo (platillos, cantidades, notas, tipo de entrega, dirección si aplica) y pide confirmación explícita del cliente.
8. Solo cuando el cliente confirme que todo es correcto, invoca finalize_order.
9. Despídete con calidez después de finalizar el pedido.

Mantén un tono amigable, cálido y profesional durante toda la llamada. Habla en español.`;
}
