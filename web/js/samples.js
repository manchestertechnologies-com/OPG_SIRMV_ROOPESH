// A few sample questions so the paper builder can be tried before real questions are added.

const tri = `<svg xmlns="http://www.w3.org/2000/svg" width="320" height="200" viewBox="0 0 320 200">
<rect width="320" height="200" fill="white"/>
<polygon points="40,170 280,170 110,30" fill="none" stroke="black" stroke-width="2.5"/>
<path d="M 64 170 A 24 24 0 0 0 52 148" fill="none" stroke="black" stroke-width="1.5"/>
<text x="30" y="188" font-family="Times New Roman" font-size="18">A</text>
<text x="282" y="188" font-family="Times New Roman" font-size="18">B</text>
<text x="104" y="22" font-family="Times New Roman" font-size="18">C</text></svg>`;
const TRIANGLE = "data:image/svg+xml;base64," + btoa(tri);

const q = (id, text, options, answer, solution, extra = {}) => ({
  id, subject: "Mathematics", chapter: extra.chapter || "", type: "MCQ", text, images: extra.images || [],
  options: options.map((t) => ({ text: t, images: [] })), answer: [answer], numAnswer: "",
  solution, solutionImages: [], lockOptions: false, createdAt: Date.now(),
});

export const SAMPLE_QUESTIONS = [
  q("sample_01", "In the triangle shown, $\\angle C = 90^\\circ$. Find the length of side $BC$.",
    ["$6$ cm", "$8$ cm", "$10$ cm", "$12$ cm"], 3,
    "Right angle at $C$, so $AB^2 = AC^2 + BC^2$.\n$BC = \\sqrt{13^2 - 5^2} = \\sqrt{144} = 12$ cm",
    { chapter: "Triangles", images: [{ src: TRIANGLE, width: 60, labels: [
      { x: 50, y: 94, text: "$13$ cm", size: 14, cover: true },
      { x: 18, y: 50, text: "$5$ cm", size: 14, cover: true },
      { x: 24, y: 79, text: "$\\theta$", size: 13, cover: false }] }] }),
  q("sample_02", "If $\\sin\\theta = \\frac{3}{5}$ and $\\theta$ is acute, then $\\tan\\theta$ equals",
    ["$\\frac{3}{4}$", "$\\frac{4}{3}$", "$\\frac{4}{5}$", "$\\frac{5}{3}$"], 0,
    "$\\cos\\theta = \\sqrt{1 - \\frac{9}{25}} = \\frac{4}{5}$\n$\\tan\\theta = \\frac{\\sin\\theta}{\\cos\\theta} = \\frac{3}{4}$", { chapter: "Trigonometry" }),
  q("sample_03", "The value of $\\displaystyle\\lim_{x\\to 0}\\frac{\\sin 3x}{x}$ is",
    ["$0$", "$1$", "$3$", "$\\frac{1}{3}$"], 2,
    "$\\frac{\\sin 3x}{x} = 3\\cdot\\frac{\\sin 3x}{3x} \\to 3 \\cdot 1 = 3$", { chapter: "Limits" }),
  q("sample_04", "The derivative of $x^2 e^x$ with respect to $x$ is",
    ["$2x e^x$", "$x^2 e^x$", "$e^x(x^2 + 2x)$", "$e^x(2x + 1)$"], 2,
    "Product rule: $\\frac{d}{dx}(x^2 e^x) = 2x e^x + x^2 e^x = e^x(x^2+2x)$", { chapter: "Differentiation" }),
  q("sample_05", "$\\displaystyle\\int_0^1 x^3\\,dx$ equals",
    ["$\\frac{1}{2}$", "$\\frac{1}{3}$", "$\\frac{1}{4}$", "$1$"], 2,
    "$\\int_0^1 x^3 dx = \\left[\\frac{x^4}{4}\\right]_0^1 = \\frac{1}{4}$", { chapter: "Integrals" }),
  q("sample_06", "The number of ways of arranging the letters of the word $\\text{LEVEL}$ is",
    ["$30$", "$60$", "$120$", "$20$"], 0,
    "5 letters with L twice and E twice: $\\frac{5!}{2!\\,2!} = 30$", { chapter: "Permutations" }),
  q("sample_07", "If $A = \\begin{pmatrix} 2 & 1 \\\\ 3 & 4 \\end{pmatrix}$, then $|A|$ is",
    ["$5$", "$11$", "$8$", "$-5$"], 0,
    "$|A| = 2\\cdot 4 - 1\\cdot 3 = 5$", { chapter: "Determinants" }),
  q("sample_08", "The sum of the first $20$ natural numbers is",
    ["$190$", "$200$", "$210$", "$220$"], 2,
    "$\\frac{n(n+1)}{2} = \\frac{20\\cdot 21}{2} = 210$", { chapter: "Sequences" }),
  q("sample_09", "The distance between the points $(1, 2)$ and $(4, 6)$ is",
    ["$3$", "$4$", "$5$", "$7$"], 2,
    "$\\sqrt{(4-1)^2 + (6-2)^2} = \\sqrt{9+16} = 5$", { chapter: "Coordinate Geometry" }),
  q("sample_10", "Which of the following is a solution of $x^2 - 5x + 6 = 0$?",
    ["$x = 1$", "$x = 2$", "$x = 4$", "None of the above"], 1,
    "$(x-2)(x-3) = 0$, so $x = 2$ or $x = 3$.", { chapter: "Quadratics" }),
  q("sample_11", "The probability of getting a sum of $7$ when two dice are thrown is",
    ["$\\frac{1}{6}$", "$\\frac{1}{12}$", "$\\frac{5}{36}$", "$\\frac{7}{36}$"], 0,
    "Favourable pairs: $(1,6),(2,5),(3,4),(4,3),(5,2),(6,1)$, so $\\frac{6}{36} = \\frac{1}{6}$", { chapter: "Probability" }),
  q("sample_12", "If $\\log_2 x = 5$, then $x$ is",
    ["$10$", "$25$", "$32$", "$64$"], 2, "$x = 2^5 = 32$", { chapter: "Logarithms" }),
];
