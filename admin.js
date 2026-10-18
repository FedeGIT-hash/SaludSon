(function () {
  "use strict";

  var SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL || "";
  var SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY || "";
  var TABLE = "products";
  var BUCKET = "product-images";
  var STORAGE_KEY = "nativa-admin-products-v1";
  var MAX_IMAGE_SIZE = 5 * 1024 * 1024;
  var client = null;
  var imageFile = null;
  var imagePreviewUrl = "";
  var toastTimer = null;

  var form = document.getElementById("product-form");
  var category = document.getElementById("category");
  var title = document.getElementById("title");
  var description = document.getElementById("description");
  var presentation = document.getElementById("presentation");
  var price = document.getElementById("price");
  var fileInput = document.getElementById("image-file");
  var uploadZone = document.getElementById("upload-zone");
  var uploadEmpty = document.getElementById("upload-empty");
  var uploadPreview = document.getElementById("upload-preview");
  var removeImage = document.getElementById("remove-image");
  var formMessage = document.getElementById("form-message");
  var draftIndicator = document.getElementById("draft-indicator");
  var connectionLabel = document.getElementById("connection-label");
  var savedProducts = document.getElementById("saved-products");
  var authDialog = document.getElementById("auth-dialog");
  var authMessage = document.getElementById("auth-message");

  function formatPrice(value) {
    var amount = Number(value);
    if (!Number.isFinite(amount) || amount <= 0) return "$0";
    return "$" + new Intl.NumberFormat("es-CO", { maximumFractionDigits: 0 }).format(amount);
  }

  function updatePreview() {
    document.getElementById("preview-category").textContent = category.value || "Categoría";
    document.getElementById("preview-title").textContent = title.value.trim() || "Nombre del producto";
    document.getElementById("preview-description").textContent = description.value.trim() || "La descripción de tu producto aparecerá aquí.";
    document.getElementById("preview-presentation").textContent = presentation.value.trim() || "Presentación";
    document.getElementById("preview-price").textContent = formatPrice(price.value);
    document.getElementById("description-count").textContent = description.value.length + " / 180";
    draftIndicator.classList.remove("is-saved");
    draftIndicator.innerHTML = '<span class="draft-dot"></span>Cambios sin guardar';
    document.querySelectorAll(".category-chip").forEach(function (chip) {
      chip.classList.toggle("selected", chip.dataset.category === category.value);
    });
  }

  function setMessage(message, isError) {
    formMessage.textContent = message;
    formMessage.classList.toggle("error", Boolean(isError));
  }

  function showToast(message) {
    var toast = document.getElementById("toast");
    toast.textContent = message;
    toast.classList.add("visible");
    window.clearTimeout(toastTimer);
    toastTimer = window.setTimeout(function () { toast.classList.remove("visible"); }, 3200);
  }

  function readLocalProducts() {
    try {
      var products = JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
      return Array.isArray(products) ? products : [];
    } catch (error) {
      return [];
    }
  }

  function writeLocalProducts(products) {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(products));
    } catch (error) {
      setMessage("No se pudo guardar en este dispositivo. La imagen puede ser demasiado grande.", true);
      return false;
    }
    renderLocalProducts();
    return true;
  }

  function renderLocalProducts() {
    var products = readLocalProducts();
    document.getElementById("saved-count").textContent = products.length + (products.length === 1 ? " producto" : " productos");
    if (!products.length) {
      savedProducts.innerHTML = '<p class="empty-list">Los borradores y publicaciones que guardes aparecerán aquí.</p>';
      return;
    }
    savedProducts.innerHTML = "";
    products.slice().reverse().forEach(function (product) {
      var row = document.createElement("article");
      row.className = "saved-item";
      var thumb = product.imageUrl ? document.createElement("img") : document.createElement("span");
      thumb.className = "saved-thumb" + (product.imageUrl ? "" : " saved-thumb-placeholder");
      if (product.imageUrl) {
        thumb.src = product.imageUrl;
        thumb.alt = "";
      } else {
        thumb.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 20V8m0 6c-4.5 0-7-2.4-7-6 4.6 0 7 2 7 6Zm0-3c0-3.4 2.2-5.5 6-5.5 0 3.8-2.1 5.5-6 5.5Z"/></svg>';
      }
      var copy = document.createElement("span");
      copy.className = "saved-copy";
      var name = document.createElement("strong");
      name.textContent = product.title;
      var detail = document.createElement("span");
      detail.textContent = product.category + " · " + product.presentation;
      copy.append(name, detail);
      var amount = document.createElement("span");
      amount.className = "saved-price";
      amount.textContent = formatPrice(product.price);
      var status = document.createElement("span");
      status.className = "saved-status" + (product.status === "published" ? " published" : "");
      status.textContent = product.status === "published" ? "Publicado" : "Borrador";
      var remove = document.createElement("button");
      remove.className = "saved-delete";
      remove.type = "button";
      remove.setAttribute("aria-label", "Eliminar " + product.title);
      remove.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 7h16M10 11v6m4-6v6M5 7l1 14h12l1-14M9 7V4h6v3"/></svg>';
      remove.addEventListener("click", function () {
        writeLocalProducts(readLocalProducts().filter(function (item) { return item.id !== product.id; }));
        showToast("Producto eliminado del dispositivo.");
      });
      row.append(thumb, copy, amount, status, remove);
      savedProducts.appendChild(row);
    });
  }

  function currentProduct(status) {
    return {
      id: window.crypto && window.crypto.randomUUID ? window.crypto.randomUUID() : String(Date.now()),
      category: category.value,
      title: title.value.trim(),
      description: description.value.trim(),
      presentation: presentation.value.trim(),
      price: Number(price.value),
      imageUrl: imagePreviewUrl || "",
      status: status,
      createdAt: new Date().toISOString()
    };
  }

  function validateProduct(requireImage) {
    if (!form.reportValidity()) return false;
    if (requireImage && !imageFile && !imagePreviewUrl) {
      setMessage("Agrega una imagen del producto antes de publicarlo.", true);
      uploadZone.focus();
      return false;
    }
    return true;
  }

  function markSaved(message) {
    draftIndicator.classList.add("is-saved");
    draftIndicator.innerHTML = '<span class="draft-dot"></span>Guardado';
    setMessage(message, false);
  }

  function saveLocally(status) {
    var product = currentProduct(status);
    if (product.imageUrl.indexOf("blob:") === 0) product.imageUrl = "";
    var products = readLocalProducts();
    products.push(product);
    if (!writeLocalProducts(products)) return false;
    markSaved(status === "published" ? "Producto publicado en este dispositivo." : "Borrador guardado en este dispositivo.");
    showToast(status === "published" ? "Producto agregado a las publicaciones locales." : "Borrador guardado.");
    return true;
  }

  async function publishToSupabase(status) {
    var sessionResult = await client.auth.getSession();
    var session = sessionResult.data && sessionResult.data.session;
    if (!session) {
      authDialog.showModal();
      authMessage.textContent = "Inicia sesión para publicar en Supabase.";
      return;
    }
    var imageUrl = imagePreviewUrl;
    if (imageFile) {
      var safeName = imageFile.name.toLowerCase().replace(/[^a-z0-9.-]+/g, "-");
      var path = "products/" + Date.now() + "-" + safeName;
      var upload = await client.storage.from(BUCKET).upload(path, imageFile, { upsert: false, contentType: imageFile.type });
      if (upload.error) throw upload.error;
      imageUrl = client.storage.from(BUCKET).getPublicUrl(path).data.publicUrl;
    }
    var product = currentProduct(status);
    var result = await client.from(TABLE).insert({
      category: product.category,
      title: product.title,
      description: product.description,
      presentation: product.presentation,
      price_cop: product.price,
      image_url: imageUrl,
      status: status
    }).select("id").single();
    if (result.error) throw result.error;
    markSaved(status === "published" ? "Producto publicado en Supabase." : "Borrador guardado en Supabase.");
    showToast(status === "published" ? "Producto publicado correctamente." : "Borrador guardado en Supabase.");
  }

  async function saveProduct(status) {
    if (!validateProduct(status === "published")) return;
    setMessage("Guardando…", false);
    try {
      if (client) await publishToSupabase(status);
      else saveLocally(status);
    } catch (error) {
      setMessage(error.message || "No fue posible guardar el producto.", true);
    }
  }

  function setImage(file) {
    if (!file) return;
    if (!/^image\/(jpeg|png|webp)$/.test(file.type)) {
      setMessage("Elige una imagen JPG, PNG o WEBP.", true);
      return;
    }
    if (file.size > MAX_IMAGE_SIZE) {
      setMessage("La imagen supera el límite de 5 MB.", true);
      return;
    }
    if (imagePreviewUrl && imagePreviewUrl.indexOf("blob:") === 0) URL.revokeObjectURL(imagePreviewUrl);
    imageFile = file;
    imagePreviewUrl = URL.createObjectURL(file);
    uploadPreview.src = imagePreviewUrl;
    uploadPreview.hidden = false;
    uploadEmpty.hidden = true;
    removeImage.hidden = false;
    document.getElementById("preview-image").src = imagePreviewUrl;
    document.getElementById("preview-image").hidden = false;
    document.getElementById("preview-placeholder").hidden = true;
    document.getElementById("image-hint").textContent = file.name;
    setMessage("Imagen lista para publicar.", false);
  }

  function clearImage() {
    if (imagePreviewUrl && imagePreviewUrl.indexOf("blob:") === 0) URL.revokeObjectURL(imagePreviewUrl);
    imageFile = null;
    imagePreviewUrl = "";
    fileInput.value = "";
    uploadPreview.removeAttribute("src");
    uploadPreview.hidden = true;
    uploadEmpty.hidden = false;
    removeImage.hidden = true;
    document.getElementById("preview-image").removeAttribute("src");
    document.getElementById("preview-image").hidden = true;
    document.getElementById("preview-placeholder").hidden = false;
    document.getElementById("image-hint").textContent = "Una imagen nítida ayuda a reconocer el producto.";
  }

  function configureSupabase() {
    if (SUPABASE_URL && SUPABASE_ANON_KEY && window.supabase) {
      client = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
      connectionLabel.innerHTML = '<span class="status-dot"></span>Supabase conectado';
      connectionLabel.classList.add("connected");
      document.getElementById("login-open").hidden = false;
      client.auth.getSession().then(function (result) {
        if (result.data && result.data.session) {
          document.getElementById("login-open").textContent = "Cerrar sesión";
          document.getElementById("login-open").dataset.signedIn = "true";
        }
      });
      client.auth.onAuthStateChange(function (_event, session) {
        var loginButton = document.getElementById("login-open");
        loginButton.textContent = session ? "Cerrar sesión" : "Iniciar sesión";
        loginButton.dataset.signedIn = session ? "true" : "false";
      });
      return;
    }
    connectionLabel.innerHTML = '<span class="status-dot"></span>Guardado local';
    document.getElementById("login-open").hidden = false;
    document.getElementById("login-open").textContent = "Iniciar sesión";
  }

  document.querySelectorAll(".category-chip").forEach(function (chip) {
    chip.addEventListener("click", function () { category.value = chip.dataset.category; updatePreview(); });
  });
  [category, title, description, presentation, price].forEach(function (field) {
    field.addEventListener("input", updatePreview);
    field.addEventListener("change", updatePreview);
  });
  uploadZone.addEventListener("click", function (event) {
    if (event.target.closest(".remove-image")) return;
    fileInput.click();
  });
  uploadZone.addEventListener("keydown", function (event) {
    if (event.key === "Enter" || event.key === " ") { event.preventDefault(); fileInput.click(); }
  });
  fileInput.addEventListener("change", function () { setImage(fileInput.files[0]); });
  ["dragenter", "dragover"].forEach(function (eventName) {
    uploadZone.addEventListener(eventName, function (event) { event.preventDefault(); uploadZone.classList.add("drag-over"); });
  });
  ["dragleave", "drop"].forEach(function (eventName) {
    uploadZone.addEventListener(eventName, function (event) {
      event.preventDefault();
      uploadZone.classList.remove("drag-over");
      if (eventName === "drop" && event.dataTransfer.files.length) setImage(event.dataTransfer.files[0]);
    });
  });
  removeImage.addEventListener("click", function (event) { event.stopPropagation(); clearImage(); });
  document.getElementById("save-draft").addEventListener("click", function () { saveProduct("draft"); });
  form.addEventListener("submit", function (event) { event.preventDefault(); saveProduct("published"); });
  document.getElementById("login-open").addEventListener("click", async function () {
    if (!client) {
      authMessage.textContent = "Configura la URL y la clave pública de Supabase en admin.js para habilitar el acceso seguro.";
      authDialog.showModal();
      return;
    }
    if (this.dataset.signedIn === "true") {
      var signedOut = await client.auth.signOut();
      authMessage.textContent = signedOut.error ? signedOut.error.message : "";
      return;
    }
    authMessage.textContent = "";
    authDialog.showModal();
  });
  document.getElementById("login-close").addEventListener("click", function () { authDialog.close(); });
  authDialog.addEventListener("click", function (event) { if (event.target === authDialog) authDialog.close(); });
  document.getElementById("auth-form").addEventListener("submit", async function (event) {
    event.preventDefault();
    if (!client) return;
    authMessage.textContent = "Verificando acceso…";
    var result = await client.auth.signInWithPassword({
      email: document.getElementById("auth-email").value,
      password: document.getElementById("auth-password").value
    });
    authMessage.textContent = result.error ? result.error.message : "Sesión iniciada.";
    if (!result.error) window.setTimeout(function () { authDialog.close(); authMessage.textContent = ""; }, 500);
  });

  renderLocalProducts();
  updatePreview();
  configureSupabase();
}());