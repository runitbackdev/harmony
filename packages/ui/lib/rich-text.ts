document.addEventListener("click", (e) => {
  const target = e.target as HTMLElement;

  if (target.closest(".composer")) return;

  const spoiler = target.closest?.("[data-mx-spoiler]");

  if (spoiler) spoiler.classList.toggle("revealed");
});
