module.exports = (req, res, next) => {
    if (req.headers['content-type'] !== 'application/json') {
      return res.status(415).json({
        statusCode: 415,
        message: 'Unsupported Media Type. Please use application/json format.',
      });
    }
    next();
  };
  