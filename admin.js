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
  var imageZoom = document.getElementById("image-zoom");
  var imagePositionX = document.getElementById("image-position-x");
  var imagePositionY = document.getElementById("image-position-y");
  var imageAdjustments = document.getElementById("image-adjustments");
  var previewImage = document.getElementById("preview-image");

  var adminApp = document.getElementById("admin-app");
  var form = document.getElementById("product-form");
  var category = document.getElementById("category");
  var title = document.getElementById("title");
  var description = document.getElementById("description");
  var presentation = document.getElementById("presentation");
  var price = document.getElementById("price");
  var stock = document.getElementById("stock");
  var fileInput = document.getElementById("image-file");
  var uploadZone = document.getElementById("upload-zone");
  var uploadEmpty = document.getElementById("upload-empty");
  var uploadPreview = document.getElementById("upload-preview");
  var removeImage = document.getElementById("remove-image");
  var formMessage = document.getElementById("form-message");
  var draftIndicator = document.getElementById("draft-indicator");
  var connectionLabel = document.getElementById("connection-label");
  var savedProducts = document.getElementById("saved-products");
  var managementProducts = document.getElementById("management-products");
  var catalogProducts = [];
  var catalogFilter = "published";
  var editingProductId = null;
  var stockColumnAvailable = true;
  var authDialog = document.getElementById("auth-dialog");
  var authMessage = document.getElementById("auth-message");
  var logoutButton = document.getElementById("logout-button");
  var authSubmitButton = document.getElementById("auth-submit");
  var authAttempt = 0;

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
    var previewAdd = document.querySelector(".preview-add");
    previewAdd.textContent = !stockColumnAvailable || stock.value === "" || Number(stock.value) > 0 ? "Agregar" : "Agotado";
    previewAdd.disabled = stockColumnAvailable && stock.value !== "" && Number(stock.value) <= 0;
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

  function renderCatalog() {
    var products = catalogFilter === "published" ? catalogProducts.filter(function (product) { return product.status === "published"; }) : catalogProducts;
    document.getElementById("catalog-count").textContent = products.length + (products.length === 1 ? " producto" : " productos");
    if (!products.length) {
      managementProducts.innerHTML = '<p class="empty-list">No hay productos en esta vista todavía.</p>';
      return;
    }
    managementProducts.innerHTML = "";
    products.forEach(function (product) {
      var row = document.createElement("article");
      row.className = "management-item";
      var image = product.image_url ? document.createElement("img") : document.createElement("span");
      image.className = "management-image" + (product.image_url ? "" : " management-image-empty");
      if (product.image_url) { image.src = product.image_url; image.alt = ""; }
      else image.textContent = "NB";
      var copy = document.createElement("div");
      copy.className = "management-copy";
      var name = document.createElement("strong");
      name.textContent = product.title;
      var detail = document.createElement("span");
      detail.textContent = product.category + " · " + product.presentation;
      var descriptionText = document.createElement("small");
      descriptionText.textContent = product.description;
      copy.append(name, detail, descriptionText);
      var amount = document.createElement("strong");
      amount.className = "management-price";
      amount.textContent = formatPrice(product.price_cop);
      var inventory = document.createElement("label");
      inventory.className = "inventory-control";
      var inventoryLabel = document.createElement("span");
      inventoryLabel.textContent = "Stock";
      var inventoryInput = document.createElement("input");
      inventoryInput.type = "number";
      inventoryInput.min = "0";
      inventoryInput.step = "1";
      inventoryInput.value = product.stock == null ? "" : String(product.stock);
      inventoryInput.placeholder = "Sin definir";
      inventoryInput.disabled = !stockColumnAvailable;
      inventoryInput.setAttribute("aria-label", "Stock disponible de " + product.title);
      inventory.append(inventoryLabel, inventoryInput);
      var status = document.createElement("span");
      status.className = "management-status" + (product.status === "published" ? " is-published" : "");
      status.textContent = product.status === "published" ? "Publicado" : "Borrador";
      var actions = document.createElement("div");
      actions.className = "management-actions";
      var saveStock = document.createElement("button");
      saveStock.type = "button";
      saveStock.className = "text-action";
      saveStock.textContent = "Actualizar stock";
      saveStock.disabled = !stockColumnAvailable;
      saveStock.addEventListener("click", function () {
        if (inventoryInput.value.trim() === "") { showToast("Escribe una cantidad de stock para actualizar."); return; }
        updateProduct(product.id, { stock: Number(inventoryInput.value) }, "Stock actualizado.");
      });
      var edit = document.createElement("button");
      edit.type = "button";
      edit.className = "text-action";
      edit.textContent = "Editar";
      edit.addEventListener("click", function () { editProduct(product); });
      var toggle = document.createElement("button");
      toggle.type = "button";
      toggle.className = "text-action";
      toggle.textContent = product.status === "published" ? "Pausar publicación" : "Publicar";
      toggle.addEventListener("click", function () {
        var nextStatus = product.status === "published" ? "draft" : "published";
        updateProduct(product.id, { status: nextStatus }, nextStatus === "published" ? "Producto publicado." : "Publicación pausada.");
      });
      var remove = document.createElement("button");
      remove.type = "button";
      remove.className = "text-action danger-action";
      remove.textContent = "Eliminar";
      remove.addEventListener("click", function () { deleteProduct(product); });
      actions.append(saveStock, edit, toggle, remove);
      row.append(image, copy, amount, inventory, status, actions);
      managementProducts.appendChild(row);
    });
  }

  async function loadCatalog() {
    if (!client || !managementProducts) return;
    managementProducts.innerHTML = '<p class="empty-list">Cargando catálogo…</p>';
    try {
      var result = await client.from(TABLE).select("id,category,title,description,presentation,price_cop,image_url,status,stock,created_at").order("created_at", { ascending: false });
      stockColumnAvailable = !result.error;
      if (result.error) {
        result = await client.from(TABLE).select("id,category,title,description,presentation,price_cop,image_url,status,created_at").order("created_at", { ascending: false });
      }
      if (result.error) throw result.error;
      catalogProducts = result.data || [];
      if (!stockColumnAvailable) catalogProducts.forEach(function (product) { product.stock = null; });
      document.getElementById("catalog-warning").hidden = stockColumnAvailable;
      renderCatalog();
    } catch (error) {
      document.getElementById("catalog-warning").hidden = true;
      var errorMessage = document.createElement("p");
      errorMessage.className = "empty-list";
      errorMessage.textContent = "No se pudo cargar el catálogo: " + (error.message || "Error de conexión");
      managementProducts.replaceChildren(errorMessage);
      document.getElementById("catalog-count").textContent = "Error al cargar";
    }
  }

  async function updateProduct(id, changes, message) {
    if (changes.stock !== undefined && !stockColumnAvailable) {
      showToast("Ejecuta primero la actualización de stock en Supabase.");
      return;
    }
    if (changes.stock !== undefined && (!Number.isInteger(changes.stock) || changes.stock < 0)) {
      showToast("El stock debe ser un número entero igual o mayor que cero.");
      return;
    }
    var result = await client.from(TABLE).update(changes).eq("id", id);
    if (result.error) { showToast(result.error.message || "No se pudo actualizar el producto."); return; }
    showToast(message);
    await loadCatalog();
  }

  async function deleteProduct(product) {
    if (!window.confirm('¿Eliminar "' + product.title + '"? Esta acción no se puede deshacer.')) return;
    var result = await client.from(TABLE).delete().eq("id", product.id);
    if (result.error) { showToast(result.error.message || "No se pudo eliminar el producto."); return; }
    showToast("Producto eliminado.");
    await loadCatalog();
  }

  function switchView(view) {
    var isCatalog = view !== "formulario";
    document.getElementById("catalog-view").hidden = !isCatalog;
    document.getElementById("editor-view").hidden = isCatalog;
    document.getElementById("page-title").textContent = isCatalog ? "Productos publicados" : (editingProductId ? "Editar producto" : "Crear producto");
    document.getElementById("page-eyebrow").textContent = isCatalog ? "CATÁLOGO · PUBLICACIONES" : "CATÁLOGO · " + (editingProductId ? "EDICIÓN" : "NUEVA PUBLICACIÓN");
    document.getElementById("page-intro").textContent = isCatalog ? "Previsualiza y administra los productos visibles en tu tienda." : "Completa los detalles y revisa cómo se verá en tu tienda.";
    document.getElementById("breadcrumb-current").textContent = isCatalog ? "Productos" : (editingProductId ? "Editar producto" : "Nuevo producto");
    document.getElementById("draft-indicator").hidden = isCatalog;
    document.querySelectorAll("[data-admin-view]").forEach(function (link) {
      var active = link.dataset.adminView === (isCatalog ? "catalogo" : "formulario");
      link.classList.toggle("active", active);
      if (active) link.setAttribute("aria-current", "page"); else link.removeAttribute("aria-current");
    });
    if (isCatalog) loadCatalog();
  }

  function editProduct(product) {
    editingProductId = product.id;
    category.value = product.category;
    title.value = product.title;
    description.value = product.description;
    presentation.value = product.presentation;
    price.value = String(product.price_cop);
    stock.value = product.stock == null ? "" : String(product.stock);
    stock.disabled = !stockColumnAvailable;
    imageFile = null;
    imagePreviewUrl = product.image_url || "";
    fileInput.value = "";
    uploadEmpty.hidden = Boolean(imagePreviewUrl);
    uploadPreview.hidden = !imagePreviewUrl;
    if (imagePreviewUrl) {
      uploadPreview.src = imagePreviewUrl;
      previewImage.src = imagePreviewUrl;
      previewImage.hidden = false;
      document.getElementById("preview-placeholder").hidden = true;
      removeImage.hidden = false;
    } else clearImage();
    updatePreview();
    document.getElementById("publish-product").textContent = product.status === "published" ? "Guardar cambios" : "Publicar producto";
    switchView("formulario");
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function currentProduct(status) {
    return {
      id: window.crypto && window.crypto.randomUUID ? window.crypto.randomUUID() : String(Date.now()),
      category: category.value,
      title: title.value.trim(),
      description: description.value.trim(),
      presentation: presentation.value.trim(),
      price: Number(price.value),
      stock: Number(stock.value),
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

  function updateImageCrop() {
    var position = imagePositionX.value + "% " + imagePositionY.value + "%";
    previewImage.style.objectPosition = position;
    previewImage.style.transform = "scale(" + Number(imageZoom.value) / 100 + ")";
    document.getElementById("image-zoom-value").value = imageZoom.value + "%";
    document.getElementById("image-position-x-value").value = imagePositionX.value + "%";
    document.getElementById("image-position-y-value").value = imagePositionY.value + "%";
  }

  function drawImageCrop(context, source, width, height) {
    var zoom = Number(imageZoom.value) / 100;
    var baseScale = Math.max(width / source.naturalWidth, height / source.naturalHeight);
    var drawnWidth = source.naturalWidth * baseScale;
    var drawnHeight = source.naturalHeight * baseScale;
    var offsetX = -(drawnWidth - width) * Number(imagePositionX.value) / 100;
    var offsetY = -(drawnHeight - height) * Number(imagePositionY.value) / 100;
    var left = width / 2 + (offsetX - width / 2) * zoom;
    var top = height / 2 + (offsetY - height / 2) * zoom;
    context.drawImage(source, left, top, drawnWidth * zoom, drawnHeight * zoom);
  }

  function createCroppedImage(file) {
    return new Promise(function (resolve, reject) {
      var source = new Image();
      var sourceUrl = URL.createObjectURL(file);
      source.onload = function () {
        URL.revokeObjectURL(sourceUrl);
        try {
          var canvas = document.createElement("canvas");
          canvas.width = 1200;
          canvas.height = 900;
          drawImageCrop(canvas.getContext("2d"), source, canvas.width, canvas.height);
          canvas.toBlob(function (blob) {
            if (!blob) {
              reject(new Error("No se pudo preparar el recorte de la imagen."));
              return;
            }
            var fileName = file.name.replace(/\.[^.]+$/, "") + "-nativa.jpg";
            resolve(new File([blob], fileName, { type: "image/jpeg" }));
          }, "image/jpeg", 0.9);
        } catch (error) {
          reject(error);
        }
      };
      source.onerror = function () {
        URL.revokeObjectURL(sourceUrl);
        reject(new Error("No se pudo leer la imagen seleccionada."));
      };
      source.src = sourceUrl;
    });
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
    if (!session || !session.user.app_metadata || session.user.app_metadata.role !== "admin") {
      await client.auth.signOut();
      showLogin("Inicia sesión con una cuenta administradora para publicar.");
      return;
    }
    var imageUrl = imagePreviewUrl;
    if (imageFile) {
      var croppedImage = await createCroppedImage(imageFile);
      var safeName = croppedImage.name.toLowerCase().replace(/[^a-z0-9.-]+/g, "-");
      var path = "products/" + Date.now() + "-" + safeName;
      var upload = await client.storage.from(BUCKET).upload(path, croppedImage, { upsert: false, contentType: croppedImage.type });
      if (upload.error) throw upload.error;
      imageUrl = client.storage.from(BUCKET).getPublicUrl(path).data.publicUrl;
    }
    var product = currentProduct(status);
    var productValues = {
      category: product.category,
      title: product.title,
      description: product.description,
      presentation: product.presentation,
      price_cop: product.price,
      image_url: imageUrl,
      status: status
    };
    if (stockColumnAvailable) productValues.stock = product.stock;
    var result = editingProductId
      ? await client.from(TABLE).update(productValues).eq("id", editingProductId)
      : await client.from(TABLE).insert(productValues).select("id").single();
    if (result.error) throw result.error;
    editingProductId = null;
    markSaved(status === "published" ? "Producto publicado en Supabase." : "Borrador guardado en Supabase.");
    showToast(status === "published" ? "Producto publicado correctamente." : "Borrador guardado en Supabase.");
    switchView("catalogo");
  }

  async function saveProduct(status) {
    if (!validateProduct(status === "published")) return;
    if (!client) {
      setMessage("Supabase no está configurado. No se guardó el producto.", true);
      return;
    }
    setMessage("Guardando…", false);
    try {
      await publishToSupabase(status);
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
    previewImage.src = imagePreviewUrl;
    previewImage.hidden = false;
    document.getElementById("preview-placeholder").hidden = true;
    document.getElementById("image-hint").textContent = file.name;
    imageZoom.value = "100";
    imagePositionX.value = "50";
    imagePositionY.value = "50";
    imageAdjustments.hidden = false;
    updateImageCrop();
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
    previewImage.removeAttribute("src");
    previewImage.style.objectPosition = "";
    previewImage.style.transform = "";
    previewImage.hidden = true;
    document.getElementById("preview-placeholder").hidden = false;
    document.getElementById("image-hint").textContent = "Una imagen nítida ayuda a reconocer el producto.";
    imageZoom.value = "100";
    imagePositionX.value = "50";
    imagePositionY.value = "50";
    imageAdjustments.hidden = true;
    updateImageCrop();
  }

  function showLogin(message) {
    adminApp.hidden = true;
    logoutButton.hidden = true;
    if (client) {
      connectionLabel.innerHTML = '<span class="status-dot"></span>Supabase conectado';
      connectionLabel.classList.add("connected");
    }
    if (!authDialog.open) authDialog.showModal();
    authMessage.textContent = message || "";
  }

  async function applySession(session) {
    if (!session) {
      showLogin("");
      return;
    }
    if (!session.user.app_metadata || session.user.app_metadata.role !== "admin") {
      await client.auth.signOut();
      showLogin("Esta cuenta no tiene permisos de administrador.");
      return;
    }
    authDialog.close();
    authMessage.textContent = "";
    adminApp.hidden = false;
    logoutButton.hidden = false;
    connectionLabel.innerHTML = '<span class="status-dot"></span>Supabase conectado';
    connectionLabel.classList.add("connected");
    loadCatalog();
  }

  function configureSupabase() {
    if (!SUPABASE_URL || !SUPABASE_ANON_KEY || !window.supabase) {
      connectionLabel.innerHTML = '<span class="status-dot"></span>Supabase sin configurar';
      showLogin("Configura Supabase para permitir el acceso seguro al panel.");
      return;
    }

    client = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
    connectionLabel.innerHTML = '<span class="status-dot"></span>Verificando acceso…';
    client.auth.getSession().then(function (result) {
      if (result.error) {
        connectionLabel.innerHTML = '<span class="status-dot"></span>Error de conexión';
        connectionLabel.classList.remove("connected");
        showLogin("No se pudo verificar la sesión. Inténtalo de nuevo.");
        return;
      }
      applySession(result.data.session);
    }).catch(function () {
      connectionLabel.innerHTML = '<span class="status-dot"></span>Error de conexión';
      connectionLabel.classList.remove("connected");
      showLogin("No se pudo conectar con Supabase.");
    });
  }

  document.querySelectorAll(".category-chip").forEach(function (chip) {
    chip.addEventListener("click", function () { category.value = chip.dataset.category; updatePreview(); });
  });
  [category, title, description, presentation, price, stock].forEach(function (field) {
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
  [imageZoom, imagePositionX, imagePositionY].forEach(function (input) {
    input.addEventListener("input", updateImageCrop);
  });
  document.getElementById("center-image").addEventListener("click", function () {
    imageZoom.value = "100";
    imagePositionX.value = "50";
    imagePositionY.value = "50";
    updateImageCrop();
  });
  document.getElementById("save-draft").addEventListener("click", function () { saveProduct("draft"); });
  form.addEventListener("submit", function (event) { event.preventDefault(); saveProduct("published"); });
  document.querySelectorAll("[data-admin-view]").forEach(function (link) {
    link.addEventListener("click", function (event) {
      event.preventDefault();
      if (link.dataset.adminView === "formulario") {
        editingProductId = null;
        form.reset();
        stock.value = "0";
        stock.disabled = !stockColumnAvailable;
        clearImage();
        updatePreview();
        document.getElementById("publish-product").textContent = "Publicar producto";
      }
      switchView(link.dataset.adminView);
      history.replaceState(null, "", link.getAttribute("href"));
    });
  });
  document.querySelectorAll(".catalog-filter").forEach(function (button) {
    button.addEventListener("click", function () {
      catalogFilter = button.dataset.filter;
      document.querySelectorAll(".catalog-filter").forEach(function (filter) { filter.classList.toggle("active", filter === button); });
      renderCatalog();
    });
  });
  logoutButton.addEventListener("click", async function () {
    if (!client) return;
    await client.auth.signOut();
    showLogin("Sesión cerrada.");
  });
  document.getElementById("auth-form").addEventListener("submit", async function (event) {
    event.preventDefault();
    if (!client) {
      authMessage.textContent = "Supabase no está configurado. Contacta a quien administra el sitio.";
      return;
    }
    var currentAttempt = ++authAttempt;
    authSubmitButton.disabled = true;
    authSubmitButton.textContent = "Validando acceso…";
    authMessage.textContent = "Verificando acceso…";
    var timeout = window.setTimeout(function () {
      if (currentAttempt !== authAttempt) return;
      authMessage.textContent = "Supabase no respondió. Comprueba la conexión y vuelve a intentarlo.";
      authSubmitButton.disabled = false;
      authSubmitButton.textContent = "Reintentar";
    }, 15000);
    try {
      var result = await client.auth.signInWithPassword({
        email: document.getElementById("auth-email").value,
        password: document.getElementById("auth-password").value
      });
      if (currentAttempt !== authAttempt) return;
      if (result.error) {
        authMessage.textContent = result.error.message;
        return;
      }
      await applySession(result.data.session);
    } catch (error) {
      if (currentAttempt === authAttempt) {
        authMessage.textContent = error.message || "No fue posible iniciar sesión.";
      }
    } finally {
      window.clearTimeout(timeout);
      if (currentAttempt === authAttempt) {
        authSubmitButton.disabled = false;
        authSubmitButton.textContent = "Entrar al panel";
      }
    }
  });

  renderLocalProducts();
  updatePreview();
  switchView("catalogo");
  configureSupabase();
}());