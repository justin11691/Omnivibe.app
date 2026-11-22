declare const worker: {
  fetch(
    request: Request,
    env?: Record<string, any>,
    ctx?: any
  ): Promise<Response>;
};

export default worker;
