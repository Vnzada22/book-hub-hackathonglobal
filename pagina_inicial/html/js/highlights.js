const reservationGuide = document.querySelector('.reservation-guide-dialog');

document.querySelectorAll('[data-open-reservation-guide]').forEach((button) => {
  button.addEventListener('click', () => {
    if (!(reservationGuide instanceof HTMLDialogElement)) {
      console.error('Não foi possível abrir as instruções de pré-reserva.');
      return;
    }

    reservationGuide.showModal();
  });
});

document.querySelector('[data-close-reservation-guide]')?.addEventListener('click', () => {
  reservationGuide?.close();
});

reservationGuide?.addEventListener('click', (event) => {
  if (event.target === reservationGuide) {
    reservationGuide.close();
  }
});
