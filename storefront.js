const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL || "";
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY || "";
const productGrid = document.getElementById("product-grid");
const catalogStatus = document.getElementById("catalog-status");

function createProductCard(product) {
  const article = document.createElement("article");
  article.className = "product";
  article.dataset.productId = String(product.id);

  const art = document.createElement("div");
  art.className = "product-art";
  try {
    const imageUrl = new URL(product.image_url);
    if (imageUrl.protocol === "https:") {
      const image = document.createElement("img");
      image.src = imageUrl.href;
      image.alt = product.title;
      image.loading = "lazy";
      art.appendChild(image);
    }
  } catch (error) {
    art.classList.add("product-art-empty");
  }
  if (!art.hasChildNodes()) art.classList.add("product-art-empty");

  const body = document.createElement("div");
  body.className = "product-body";

  const tag = document.createElement("span");
  tag.className = "tag";
  tag.textContent = product.category;

  const title = document.createElement("h3");
  title.textContent = product.title;

  const description = document.createElement("p");
  description.textContent = product.description;

  const meta = document.createElement("div");
  meta.className = "product-meta";

  const presentation = document.createElement("span");
  presentation.textContent = product.presentation;

  const price = document.createElement("span");
  price.className = "price";
  price.textContent = "$" + Number(product.price_cop).toLocaleString("es-CO");

  const addButton = document.createElement("button");
  addButton.className = "btn btn-block add-to-cart";
  addButton.type = "button";
  addButton.dataset.id = String(product.id);
  addButton.textContent = "Agregar";

  meta.append(presentation, price);
  body.append(tag, title, description, meta, addButton);
  article.append(art, body);
  return article;
}

async function loadPublishedProducts() {
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) return;

  const endpoint = new URL("/rest/v1/products", SUPABASE_URL);
  endpoint.search = new URLSearchParams({
    select: "id,category,title,description,presentation,price_cop,image_url,created_at",
    status: "eq.published",
    order: "created_at.desc"
  }).toString();

  try {
    const response = await fetch(endpoint, {
      headers: {
        apikey: SUPABASE_ANON_KEY,
        Authorization: "Bearer " + SUPABASE_ANON_KEY
      }
    });
    if (!response.ok) throw new Error("Supabase respondió " + response.status);

    const products = await response.json();
    if (!Array.isArray(products) || !products.length) return;

    products.forEach(function (product, index) {
      productGrid.insertBefore(createProductCard(product), productGrid.children[index] || null);
    });
    window.dispatchEvent(new CustomEvent("nativa:products-loaded", { detail: products }));
  } catch (error) {
    catalogStatus.hidden = false;
    catalogStatus.textContent = "No pudimos cargar los productos nuevos. Intenta actualizar la página.";
    console.error("No se pudo cargar el catálogo de Supabase.", error);
  }
}

loadPublishedProducts();