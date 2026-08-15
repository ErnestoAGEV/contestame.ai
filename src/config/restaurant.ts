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
  if (!normalized) return undefined;

  const exact = MENU.find((item) => item.name.toLowerCase() === normalized);
  if (exact) return exact;

  const candidates = MENU.filter(
    (item) =>
      item.name.toLowerCase().includes(normalized) ||
      normalized.includes(item.name.toLowerCase())
  );
  return candidates.length === 1 ? candidates[0] : undefined;
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
2. Pregunta qué desea ordenar el cliente. Cuando el cliente pregunte qué hay o dude qué pedir, no te limites a leer el menú de la lista: véndelo, como lo haría un buen mesero. Destaca 1-2 platillos estrella con una frase breve y apetitosa (por ejemplo, resalta que la gringa o el taco de asada son los favoritos de la casa), sugiere un extra o bebida que combine con lo que ya pidió, y ofrece un platillo similar si el que pidió no está disponible. Sé entusiasta pero breve, sin sonar como comercial ni presionar de más. Usa la función add_item cada vez que el cliente mencione un platillo y cantidad; usa remove_item si el cliente cambia de opinión.
3. Si el cliente pide algo que no está en el menú, dile amablemente que no está disponible y sugiere una alternativa del menú.
4. Cuando el cliente termine de ordenar, pregunta si es para recoger en el restaurante o para entrega a domicilio, y usa set_order_type con el valor correspondiente.
5. Si es entrega a domicilio, pide la dirección completa y usa set_delivery_address.
6. Pregunta el nombre del cliente y usa set_customer_name.
7. Antes de cerrar, repite en voz alta el pedido completo (platillos, cantidades, notas, tipo de entrega, dirección si aplica) y pide confirmación explícita del cliente.
8. Solo cuando el cliente confirme que todo es correcto, invoca finalize_order.
9. Despídete con calidez después de finalizar el pedido.

Mantén un tono relajado pero siempre respetuoso durante toda la llamada, como un asistente mexicano amable y profesional (evita ser demasiado informal o usar jerga muy coloquial). Habla en español de México, con acento mexicano natural. Evita cualquier acento o entonación que no sea mexicana.`;
}
