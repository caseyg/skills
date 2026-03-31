/**
 * Tests that installing skills with the Bob agent flag installs to .bob, not .agents.
 */

import { describe, it, expect } from 'vitest';
import { mkdtemp, mkdir, rm, writeFile, lstat, readFile, readlink } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { installSkillForAgent } from '../src/installer.ts';
import { agents } from '../src/agents.ts';

async function makeSkillSource(root: string, name: string): Promise<string> {
  const dir = join(root, 'source-skill');
  await mkdir(dir, { recursive: true });
  const skillMd = `---\nname: ${name}\ndescription: test skill\n---\n# ${name}\n`;
  await writeFile(join(dir, 'SKILL.md'), skillMd, 'utf-8');
  return dir;
}

describe('bob agent skill installation', () => {
  it('bob agent config uses .bob/skills, not .agents/skills', () => {
    const bobConfig = agents['bob'];
    expect(bobConfig).toBeDefined();
    expect(bobConfig.skillsDir).toBe('.bob/skills');
    expect(bobConfig.skillsDir).not.toBe('.agents/skills');
  });

  it('installs skill to .bob/skills directory, not .agents/skills', async () => {
    const root = await mkdtemp(join(tmpdir(), 'bob-skill-'));
    const projectDir = join(root, 'project');
    await mkdir(projectDir, { recursive: true });

    const skillName = 'test-bob-skill';
    const skillDir = await makeSkillSource(root, skillName);

    try {
      const result = await installSkillForAgent(
        { name: skillName, description: 'test skill', path: skillDir },
        'bob',
        { cwd: projectDir, mode: 'symlink', global: false }
      );

      expect(result.success).toBe(true);

      // Skill should be symlinked at .bob/skills/<skill-name>
      const bobSkillPath = join(projectDir, '.bob/skills', skillName);
      const stats = await lstat(bobSkillPath);
      // Should exist (as symlink or directory)
      expect(stats.isSymbolicLink() || stats.isDirectory()).toBe(true);

      // Verify SKILL.md content is accessible
      const contents = await readFile(join(bobSkillPath, 'SKILL.md'), 'utf-8');
      expect(contents).toContain(`name: ${skillName}`);

      // Canonical copy should be in .agents/skills
      const canonicalPath = join(projectDir, '.agents/skills', skillName);
      const canonicalStats = await lstat(canonicalPath);
      expect(canonicalStats.isDirectory()).toBe(true);

      // The .bob/skills path should be a symlink pointing to canonical
      if (stats.isSymbolicLink()) {
        const linkTarget = await readlink(bobSkillPath);
        expect(linkTarget).toContain('.agents/skills');
      }
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it('installs skill to .bob/skills in copy mode', async () => {
    const root = await mkdtemp(join(tmpdir(), 'bob-skill-'));
    const projectDir = join(root, 'project');
    await mkdir(projectDir, { recursive: true });

    const skillName = 'test-bob-copy';
    const skillDir = await makeSkillSource(root, skillName);

    try {
      const result = await installSkillForAgent(
        { name: skillName, description: 'test skill', path: skillDir },
        'bob',
        { cwd: projectDir, mode: 'copy', global: false }
      );

      expect(result.success).toBe(true);
      expect(result.mode).toBe('copy');

      // Skill should be directly in .bob/skills/<skill-name>
      const bobSkillPath = join(projectDir, '.bob/skills', skillName);
      const stats = await lstat(bobSkillPath);
      expect(stats.isDirectory()).toBe(true);
      expect(stats.isSymbolicLink()).toBe(false);

      // Verify content
      const contents = await readFile(join(bobSkillPath, 'SKILL.md'), 'utf-8');
      expect(contents).toContain(`name: ${skillName}`);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});
