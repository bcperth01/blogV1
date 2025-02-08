const errorHandler = (err, req, res, next) => {
  console.lo(err.stack);
  res.status(500).json({
    status: 500,
    message: "server error",
    error: err.message,
  });
};

export default errorHandler;
