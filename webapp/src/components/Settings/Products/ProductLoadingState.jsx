/**
 * ProductLoadingState - Loading spinner for products
 */
function ProductLoadingState() {
  return (
    <div className="text-center py-12">
      <div className="inline-block w-8 h-8 border-4 border-orange-primary border-t-transparent rounded-full animate-spin"></div>
    </div>
  );
}

export default ProductLoadingState;
