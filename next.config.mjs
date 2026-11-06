/** @type {import('next').NextConfig} */
const nextConfig = {
  poweredByHeader: false,
  experimental: {
    // telas pré-carregadas pelo menu (Link com prefetch) ficam prontas por até 3 min; os dados delas se atualizam pelo canal de novidades.
    // As demais telas continuam sendo buscadas a cada visita (o padrão), para nada aparecer desatualizado depois de uma alteração.
    staleTimes: { static: 180 },
  },
};
export default nextConfig;
