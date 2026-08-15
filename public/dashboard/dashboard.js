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

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str ?? '';
  return div.innerHTML;
}

function renderCard(order) {
  const card = document.createElement('article');
  card.className = 'card';
  card.id = `order-${order.id}`;

  const itemsHtml = order.items
    .map(
      (item) =>
        `<li>${item.quantity}× ${escapeHtml(item.name)}${item.notes ? ` — <em>${escapeHtml(item.notes)}</em>` : ''}</li>`
    )
    .join('');

  const typeLabel = order.type === 'delivery' ? 'Entrega a domicilio' : 'Para recoger';
  const hasAddress = order.type === 'delivery' && order.address;
  const addressHtml = hasAddress ? `<p class="address">${escapeHtml(order.address)}</p>` : '';
  const mapHtml = hasAddress
    ? `<iframe class="map-embed" src="https://maps.google.com/maps?q=${encodeURIComponent(order.address)}&output=embed" loading="lazy" referrerpolicy="no-referrer-when-downgrade"></iframe>`
    : '';
  const nextStatus = NEXT_STATUS[order.status];

  card.innerHTML = `
    <div class="card-header">
      <span class="customer">${escapeHtml(order.customerName || 'Cliente')}</span>
      <span class="time">${timeAgo(order.createdAt)}</span>
    </div>
    <span class="badge badge-${order.type}">${typeLabel}</span>
    ${addressHtml}
    ${mapHtml}
    <ul class="items">${itemsHtml}</ul>
    ${nextStatus ? `<button class="advance-btn" data-id="${order.id}" data-next="${nextStatus}">Avanzar a ${nextStatus}</button>` : ''}
  `;

  card.querySelector('.advance-btn')?.addEventListener('click', async (e) => {
    const btn = e.currentTarget;
    const id = btn.getAttribute('data-id');
    const next = btn.getAttribute('data-next');
    btn.disabled = true;
    try {
      const response = await fetch(`/api/orders/${id}/status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: next }),
      });
      if (!response.ok) {
        alert('No se pudo actualizar el pedido, intenta de nuevo.');
        btn.disabled = false;
      }
      // on success, the socket.io order:updated event will re-render the card, so no need to manually re-enable here
    } catch (err) {
      alert('No se pudo actualizar el pedido, revisa tu conexión.');
      btn.disabled = false;
    }
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

// Fires on the initial connection and again on every reconnect (e.g. WiFi
// hiccup, backgrounded mobile browser), so a single handler both loads the
// board on first load and re-syncs it after any dropped connection.
socket.on('connect', loadInitialOrders);
