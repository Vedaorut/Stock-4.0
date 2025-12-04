import { AnimatePresence } from 'framer-motion';
import ProductCard from './ProductCard';

/**
 * ProductList - Grid/list of product cards
 */
function ProductList({ products, onEdit, onDelete, t }) {
  return (
    <div className="space-y-3">
      <h3 className="text-sm font-semibold text-gray-400 px-2">Product List</h3>
      <AnimatePresence mode="popLayout">
        {products.map((product) => (
          <ProductCard
            key={product.id}
            product={product}
            onEdit={onEdit}
            onDelete={onDelete}
            t={t}
          />
        ))}
      </AnimatePresence>
    </div>
  );
}

export default ProductList;
