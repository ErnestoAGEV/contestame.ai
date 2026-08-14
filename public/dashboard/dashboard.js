const NEXT_STATUS = {
  recibido: 'preparando',
  preparando: 'listo',
  listo: 'completado',
};

const socket = io();

function timeAgo(isoDate) {
  const minutes = Math.floor((Date.now() - new Date(isoDate).getTime()) / 60000);
  if (minutes < 1) return 'hace un momento';
  if (minutes === 1) return 'hace 1 min';
  return `hace ${minutes} min`;
}

function renderCard(order) {
  const card = document.createElement('article');
  card.className = 'card';
  card.id = `order-${order.id}`;

  const itemsHtml = order.items
    .map((item) => `<li>${item.quantity}× ${item.name}${item.notes ? ` — <em>${item.notes}</em>` : ''}</li>`)
    .join('');

  const typeLabel = order.type === 'delivery' ? 'Entrega a domicilio' : 'Para recoger';
  const addressHtml =
    order.type === 'delivery' && order.address ? `<p class="address">${order.address}</p>` : '';
  const nextStatus = NEXT_STATUS[order.status];

  card.innerHTML = `
    <div class="card-header">
      <span class="customer">${order.customerName || 'Cliente'}</span>
      <span class="time">${timeAgo(order.createdAt)}</span>
    </div>
    <span class="badge badge-${order.type}">${typeLabel}</span>
    ${addressHtml}
    <ul class="items">${itemsHtml}</ul>
    ${nextStatus ? `<button class="advance-btn" data-id="${order.id}" data-next="${nextStatus}">Avanzar a ${nextStatus}</button>` : ''}
  `;

  card.querySelector('.advance-btn')?.addEventListener('click', async (e) => {
    const id = e.currentTarget.getAttribute('data-id');
    const next = e.currentTarget.getAttribute('data-next');
    await fetch(`/api/orders/${id}/status`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: next }),
    });
  });

  return card;
}

function placeCard(order) {
  document.getElementById(`order-${order.id}`)?.remove();
  document.getElementById(`cards-${order.status}`)?.prepend(renderCard(order));
}

async function loadInitialOrders() {
  const response = await fetch('/api/orders');
  const orders = await response.json();
  orders.forEach(placeCard);
}

socket.on('order:new', placeCard);
socket.on('order:updated', placeCard);

loadInitialOrders();
