import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { lerFrontmatter, lerFuncionarios, detectarTipo, listarSkills } from '../funcionarios.js';

function projetoTemp(nome = 'Conteudo May') {
  const cwd = join(mkdtempSync(join(tmpdir(), 'predio-func-')), 'Área de Trabalho', nome);
  mkdirSync(cwd, { recursive: true });
  return cwd;
}
function escrever(cwd, rel, texto) {
  const f = join(cwd, rel);
  mkdirSync(join(f, '..'), { recursive: true });
  writeFileSync(f, texto);
}

test('lê o frontmatter simples', () => {
  assert.deepEqual(lerFrontmatter('---\nname: x\ndescription: Faz: coisas\n---\ncorpo'), { name: 'x', description: 'Faz: coisas' });
  assert.deepEqual(lerFrontmatter('sem cabeçalho'), {});
});

test('lê os funcionários', () => {
  const cwd = projetoTemp();
  escrever(cwd, '.claude/agents/roteirista.md', '---\nname: roteirista\ndescription: Escreve roteiros.\ntools: Read, Write\n---\n');
  escrever(cwd, '.claude/agents/copywriter.md', '---\nname: copywriter\ndescription: Legendas.\ntools: Read\n---\n');
  escrever(cwd, '.claude/agents/estoque.md', '---\ndescription: Catálogo.\n---\n');
  const f = lerFuncionarios(cwd);
  assert.deepEqual(f.map(x => x.nome), ['copywriter', 'estoque', 'roteirista']);
  assert.deepEqual(f[2], { nome: 'roteirista', descricao: 'Escreve roteiros.', ferramentas: ['Read', 'Write'] });
  assert.deepEqual(f[1].ferramentas, []);
});

test('sem pasta de agentes', () => {
  assert.deepEqual(lerFuncionarios(projetoTemp()), []);
  assert.deepEqual(lerFuncionarios(join(tmpdir(), 'nao-existe-predio')), []);
});

test('detecta linha de produção', () => {
  const cwd = projetoTemp();
  escrever(cwd, 'sistema/pipeline.js', 'export {}');
  escrever(cwd, 'package.json', JSON.stringify({ scripts: { status: 'node sistema/status.js' } }));
  assert.equal(detectarTipo(cwd), 'linha-producao');
});

test('detecta biblioteca', () => {
  const cwd = projetoTemp('skills');
  for (const n of ['a', 'b', 'c', 'd']) escrever(cwd, `.agents/skills/${n}/SKILL.md`, `---\nname: ${n}\n---`);
  assert.equal(detectarTipo(cwd), 'biblioteca');
});

test('pasta inexistente é fila', () => {
  assert.equal(detectarTipo(join(tmpdir(), 'nao-existe-predio')), 'fila');
  assert.equal(detectarTipo(projetoTemp()), 'fila');
});

test('lista skills sem repetir', () => {
  const cwd = projetoTemp('skills');
  escrever(cwd, 'pptx/SKILL.md', '---\nname: pptx\ndescription: Slides.\n---');
  escrever(cwd, '.agents/skills/pptx/SKILL.md', '---\nname: pptx\ndescription: Slides.\n---');
  escrever(cwd, 'brainstorming/SKILL.md', '---\nname: brainstorming\ndescription: Ideias.\n---');
  escrever(cwd, 'node_modules/x/SKILL.md', '---\nname: x\n---');
  assert.deepEqual(listarSkills(cwd), [{ nome: 'brainstorming', descricao: 'Ideias.' }, { nome: 'pptx', descricao: 'Slides.' }]);
});
