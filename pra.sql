SELECT 
      product.*, cart.quantity
    FROM 
      cart
    INNER JOIN 
      product ON cart.product_id = product.id
    WHERE 
      cart.username = 'prashanth_reddy';
    


