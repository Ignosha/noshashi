
/*
 * Billing period switch.
 *
 * Both figures ship in the markup as data attributes rather than being
 * computed here, so the annual price on the page is the annual price in
 * the catalogue — not the monthly one multiplied by a number this script
 * happens to hold. If the two ever disagree, the fix belongs in one place.
 *
 * The page is fully readable with this script blocked: the monthly
 * figures are the rendered ones, and the switch is the only thing that
 * stops working.
 */
(function () {
  var monthly = document.getElementById("cadence-monthly");
  var annual = document.getElementById("cadence-annual");
  var note = document.getElementById("cadence-note");
  if (!monthly || !annual) return;

  var fields = document.querySelectorAll("[data-monthly][data-annual]");

  function apply(period) {
    for (var i = 0; i < fields.length; i += 1) {
      var value = fields[i].getAttribute("data-" + period);
      if (value) fields[i].textContent = value;
    }
    monthly.setAttribute("aria-pressed", String(period === "monthly"));
    annual.setAttribute("aria-pressed", String(period === "annual"));
    // The switch used to change only the rendered figures, so a visitor
    // who chose "Annual prepay" and paid was put on the monthly price.
    var cadenceField = document.getElementById("pro-cadence");
    if (cadenceField) cadenceField.value = period;
    if (note) {
      note.textContent =
        period === "annual"
          ? "Invoiced once · Pro and Institutional get two months free · Enterprise and Strategic are yearly contracts"
          : "Pro and Institutional: annual is 10 × monthly, two months free";
    }
  }

  monthly.addEventListener("click", function () { apply("monthly"); });
  annual.addEventListener("click", function () { apply("annual"); });
})();
