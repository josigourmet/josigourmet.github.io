const ORIGENS_PERMITIDAS = [
    'https://josidocesgoumert.netlify.app',
    'https://josigourmet.github.io'
];

const FIREBASE_DB = 'https://josigourmet-af3ff-default-rtdb.firebaseio.com';

// Lista de segurança: usada só se o Firebase não responder
const CARDAPIO_FALLBACK = `- Torta de bolacha no pote: R$ 10,00 (Sabores: Nata Ninho, Doce de leite com chocolate amargo e Bombom)
- Torta de Bolacha Grande 1 kg: R$ 55,00
- Bolo grande: R$ 35,00 (Sabores: Chocolate, Beijinhos e Brigadeiro, Cenoura com brigadeiro, Chocolate amargo, Doce de leite)
- Bolo no pote: R$ 10,00 (Sabores: Beijinho, Coco, Doce de leite, Brigadeiro, Cenoura com brigadeiro)
- Torta grande (A partir de 1 kg): A partir de R$ 60,00
- Bolo no Pote com Pudim: R$ 14,00
- Bolo de Stikadinho no Pote: R$ 12,00`;

// Produtos que continuam fixos no código do site
const PRODUTOS_FIXOS = `- Combo Família: 4 Bolos no Pote por R$ 36,00 (cliente escolhe os sabores ao adicionar)
- Açaí Copo 400 ml: R$ 18,00 (até 4 adicionais: frutas, complementos ou cremes)`;

const fmtPreco = v => Number(v).toFixed(2).replace('.', ',');

function montarHeadersCors(origemRecebida) {
    const origem = ORIGENS_PERMITIDAS.includes(origemRecebida)
        ? origemRecebida
        : ORIGENS_PERMITIDAS[0];

    return {
        'Access-Control-Allow-Origin': origem,
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
        'Vary': 'Origin'
    };
}

async function carregarCardapioTexto() {
    try {
        const r = await fetch(`${FIREBASE_DB}/config/cardapio.json`);
        if (!r.ok) throw new Error('status ' + r.status);
        const dados = await r.json();
        if (!dados) throw new Error('cardápio vazio');

        const linhas = Object.values(dados)
            .filter(p => p && p.nome && p.ativo !== false && !isNaN(Number(p.preco)))
            .sort((a, b) => (a.ordem || 0) - (b.ordem || 0))
            .map(p => {
                const preco = `${p.aPartir ? 'A partir de ' : ''}R$ ${fmtPreco(p.preco)}`;
                const sabores = Array.isArray(p.sabores) && p.sabores.length
                    ? ` (Sabores: ${p.sabores.join(', ')})`
                    : '';
                return `- ${p.nome}: ${preco}${sabores}`;
            });

        if (!linhas.length) throw new Error('nenhum produto ativo');
        return linhas.join('\n');
    } catch (e) {
        console.error('Cardápio do Firebase indisponível, usando lista de segurança:', e.message);
        return CARDAPIO_FALLBACK;
    }
}

async function carregarPromocaoTexto() {
    try {
        const r = await fetch(`${FIREBASE_DB}/config/promocao.json`);
        const p = await r.json();
        if (!p || !p.ativa || !p.nomeProduto) return '';
        return `\nPROMOÇÃO ATIVA AGORA: ${p.nomeProduto} por R$ ${fmtPreco(p.preco)}. Mencione quando fizer sentido para o cliente.`;
    } catch (e) {
        return '';
    }
}

function montarPrompt(cardapioTexto, promoTexto) {
    return `Você é a assistente virtual super simpática e acolhedora da "Josi Doces Gourmet", localizada em Venâncio Aires.
Seu objetivo principal é ajudar os clientes do site com dúvidas sobre o cardápio, entregas e pedidos.

Nossos produtos e preços oficiais listados no site são:
${cardapioTexto}
${PRODUTOS_FIXOS}
${promoTexto}

Regras Importantes da Loja:
- Oferecemos Frete Grátis + 5% de desconto automático para qualquer compra a partir de R$ 50,00.
- Atendimento e Entregas: Segunda a Domingo, inclusive feriados, das 08h às 17h.
- Endereço físico para retirada no local: Rua Marechal Floriano, 3197, bairro Coronel Brito.
- Pedidos normais (itens do cardápio de pronta entrega): agendar com pelo menos 1 hora de antecedência no site. Esse é o tempo médio de preparo e entrega/retirada.
- Encomendas para eventos (grandes quantidades, orçamentos personalizados): agendar com pelo menos 2 dias de antecedência, pelo WhatsApp.
- Nosso WhatsApp para dúvidas, orçamentos de eventos ou qualquer outro contato é (51) 98932-4150.

Nossa história: A Josi Doces Gourmet começou em 19 de abril de 2026, de forma simples, entre panelas e sonhos na cozinha de casa. O que era um hobby se transformou em paixão ao ver o sorriso de quem provava os doces. Hoje, cada torta de bolacha e bolo que sai da cozinha carrega essa essência: o sabor autêntico do doce feito à mão, com a qualidade de produtos gourmet premium. A loja se orgulha de ser feita com amor, usar ingredientes premium e produzir tudo sob encomenda para garantir o máximo frescor.

Instruções de Comportamento da IA:
- Responda sempre de forma curta, prestativa e muito fofa. Use muitos emojis de doces (🍰, 🤎, ✨, 🍬, 🧁).
- Se o cliente perguntar o número de WhatsApp ou quiser falar diretamente com a loja, informe (51) 98932-4150 e, se fizer sentido, ofereça o link: https://wa.me/5551989324150
- Se o cliente perguntar sobre a história da loja, como ela começou, ou desde quando existe, conte a história acima de forma breve, calorosa e emocionante, sem inventar detalhes que não foram informados.
- Incentive gentilmente o cliente a escolher e adicionar os itens diretamente nas caixinhas de quantidade do site para montar o carrinho.
- Se perguntarem coisas muito fora do assunto de confeitaria, mude de assunto ou decline educadamente dizendo que foca em adoçar a vida deles.`;
}

exports.handler = async function (event) {
    const HEADERS_CORS = montarHeadersCors(event.headers && (event.headers.origin || event.headers.Origin));

    // Responde à pré-checagem (preflight) que o navegador manda antes do POST cross-origin
    if (event.httpMethod === 'OPTIONS') {
        return { statusCode: 204, headers: HEADERS_CORS, body: '' };
    }

    if (event.httpMethod !== 'POST') {
        return { statusCode: 405, headers: HEADERS_CORS, body: 'Method Not Allowed' };
    }

    try {
        const { mensagem } = JSON.parse(event.body);
        if (!mensagem || typeof mensagem !== 'string') {
            return { statusCode: 400, headers: HEADERS_CORS, body: JSON.stringify({ erro: 'Mensagem inválida' }) };
        }

        // Busca cardápio e promoção atuais no Firebase (em paralelo)
        const [cardapioTexto, promoTexto] = await Promise.all([
            carregarCardapioTexto(),
            carregarPromocaoTexto()
        ]);
        const CONTEXTO_PROMPT_JOSI = montarPrompt(cardapioTexto, promoTexto);

        const resposta = await fetch('https://api.groq.com/openai/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${process.env.GROQ_API_KEY}`
            },
            body: JSON.stringify({
                model: 'openai/gpt-oss-120b',
                messages: [
                    { role: 'system', content: CONTEXTO_PROMPT_JOSI },
                    { role: 'user', content: mensagem }
                ]
            })
        });

        const dados = await resposta.json();

        if (!resposta.ok) {
            console.error('Groq retornou erro:', JSON.stringify(dados));
            throw new Error((dados && dados.error && dados.error.message) || 'Erro na API da Groq');
        }

        const textoIa = dados?.choices?.[0]?.message?.content;

        if (!textoIa) throw new Error('Resposta inesperada da IA');

        return {
            statusCode: 200,
            headers: HEADERS_CORS,
            body: JSON.stringify({ resposta: textoIa })
        };
    } catch (erro) {
        console.error('Erro na function chat:', erro);
        return {
            statusCode: 500,
            headers: HEADERS_CORS,
            body: JSON.stringify({ erro: 'Falha ao consultar a IA' })
        };
    }
};
