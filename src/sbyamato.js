'use strict';
const SBYCORE = (function () {
const module = undefined;
///////////////////////////////////////////////////////////////////////////////
/// @file Z80.js
///
/// @brief Emulator for the Zilog Z80 microprocessor
///
/// @author Molly Howell
///
/// @remarks
///  This module is a simple, straightforward instruction interpreter.
///   There is no fancy dynamic recompilation or cycle-accurate emulation.
///   The author believes that this should be sufficient for any emulator that
///   would be feasible to write in JavaScript anyway.
///  The code and the comments in this file assume that the reader is familiar
///   with the Z80 architecture. If you're not, here are some references I use:
///  http://clrhome.org/table/ - Z80 instruction set tables
///  http://www.zilog.com/docs/z80/um0080.pdf - The official manual
///  http://www.myquest.nl/z80undocumented/z80-documented-v0.91.pdf
///   - The Undocumented Z80, Documented
///
/// @copyright (c) Molly Howell
///  This code is released under the MIT license,
///  a copy of which is available in the associated README.md file,
///  or at http://opensource.org/licenses/MIT
///////////////////////////////////////////////////////////////////////////////

"use strict";

///////////////////////////////////////////////////////////////////////////////
/// We'll begin with the object constructor and the public API functions.
///////////////////////////////////////////////////////////////////////////////
function Z80(coreParameter)
{
   // Obviously we'll be needing the core object's functions again.
   let core = coreParameter;

   // The argument to this constructor should be an object containing 4 functions:
   // mem_read(address) should return the byte at the given memory address,
   // mem_write(address, value) should write the given value to the given memory address,
   // io_read(port) should read a return a byte read from the given I/O port,
   // io_write(port, value) should write the given byte to the given I/O port.
   // If any of those functions is missing, this module cannot run.
   if (!core || (typeof core.mem_read !== "function") || (typeof core.mem_write !== "function") ||
                (typeof core.io_read !== "function")  || (typeof core.io_write !== "function"))
      throw("Z80: Core object is missing required functions.");
   
   if (typeof window !== "undefined" && this === window)
      throw("Z80: This function is a constructor; call it using operator new.");

   // All right, let's initialize the registers.
   // First, the standard 8080 registers.
   let a = 0x00;
   let b = 0x00;
   let c = 0x00;
   let d = 0x00;
   let e = 0x00;
   let h = 0x00;
   let l = 0x00;
   // Now the special Z80 copies of the 8080 registers
   //  (the ones used for the SWAP instruction and such).
   let a_prime = 0x00;
   let b_prime = 0x00;
   let c_prime = 0x00;
   let d_prime = 0x00;
   let e_prime = 0x00;
   let h_prime = 0x00;
   let l_prime = 0x00;
   // And now the Z80 index registers.
   let ix = 0x0000;
   let iy = 0x0000;
   // Then the "utility" registers: the interrupt vector,
   //  the memory refresh, the stack pointer, and the program counter.
   let i = 0x00;
   let r = 0x00;
   let sp = 0xdff0;
   let pc = 0x0000;
   // We don't keep an F register for the flags,
   //  because most of the time we're only accessing a single flag,
   //  so we optimize for that case and use utility functions
   //  for the rarer occasions when we need to access the whole register.
   let flags = {S:0, Z:0, Y:0, H:0, X:0, P:0, N:0, C:0};
   let flags_prime = {S:0, Z:0, Y:0, H:0, X:0, P:0, N:0, C:0};
   // And finally we have the interrupt mode and flip-flop registers.
   let imode = 0;
   let iff1 = 0;
   let iff2 = 0;
   
   // These are all specific to this implementation, not Z80 features.
   // Keep track of whether we've had a HALT instruction called.
   let halted = false;
   // EI and DI wait one instruction before they take effect;
   //  these flags tell us when we're in that wait state.
   let do_delayed_di = false;
   let do_delayed_ei = false;
   // This tracks the number of cycles spent in a single instruction run,
   //  including processing any prefixes and handling interrupts.
   let cycle_counter = 0;
   
   function getState() {
      return {
         b: b,
         a: a,
         c: c,
         d: d,
         e: e,
         h: h,
         l: l,
         a_prime: a_prime,
         b_prime: b_prime,
         c_prime: c_prime,
         d_prime: d_prime,
         e_prime: e_prime,
         h_prime: h_prime,
         l_prime: l_prime,
         ix  : ix,
         iy  : iy,
         i   : i,
         r   : r,
         sp  : sp,
         pc  : pc,      
         flags: { 
            S: flags.S,
            Z: flags.Z,
            Y: flags.Y,
            H: flags.H,
            X: flags.X,
            P: flags.P,
            N: flags.N,
            C: flags.C
         },         
         flags_prime: { 
            S: flags_prime.S,
            Z: flags_prime.Z,
            Y: flags_prime.Y,
            H: flags_prime.H,
            X: flags_prime.X,
            P: flags_prime.P,
            N: flags_prime.N,
            C: flags_prime.C
         },         
         imode         : imode,
         iff1          : iff1,
         iff2          : iff2,
         halted        : halted,
         do_delayed_di : do_delayed_di,
         do_delayed_ei : do_delayed_ei,
         cycle_counter : cycle_counter
      };   
   }

   function setState(state) {
      b = state.b;
      a = state.a;
      c = state.c;
      d = state.d;
      e = state.e;
      h = state.h;
      l = state.l;
      a_prime = state.a_prime;
      b_prime = state.b_prime;
      c_prime = state.c_prime;
      d_prime = state.d_prime;
      e_prime = state.e_prime;
      h_prime = state.h_prime;
      l_prime = state.l_prime;
      ix  = state.ix;
      iy  = state.iy;
      i   = state.i;
      r   = state.r;
      sp  = state.sp;
      pc  = state.pc;      
      flags.S = state.flags.S;
      flags.Z = state.flags.Z;
      flags.Y = state.flags.Y;
      flags.H = state.flags.H;
      flags.X = state.flags.X;
      flags.P = state.flags.P;
      flags.N = state.flags.N;
      flags.C = state.flags.C;         
      flags_prime.S = state.flags_prime.S;
      flags_prime.Z = state.flags_prime.Z;
      flags_prime.Y = state.flags_prime.Y;
      flags_prime.H = state.flags_prime.H;
      flags_prime.X = state.flags_prime.X;
      flags_prime.P = state.flags_prime.P;
      flags_prime.N = state.flags_prime.N;
      flags_prime.C = state.flags_prime.C;               
      imode = state.imode;
      iff1 = state.iff1;
      iff2 = state.iff2;
      halted = state.halted;
      do_delayed_di = state.do_delayed_di;
      do_delayed_ei = state.do_delayed_ei;
      cycle_counter = state.cycle_counter;
   }

///////////////////////////////////////////////////////////////////////////////
/// @public reset
///
/// @brief Re-initialize the processor as if a reset or power on had occured
///////////////////////////////////////////////////////////////////////////////
let reset = function()
{
   // These registers are the ones that have predictable states
   //  immediately following a power-on or a reset.
   // The others are left alone, because their states are unpredictable.
   sp = 0xdff0;
   pc = 0x0000;
   a = 0x00;
   r = 0x00;
   set_flags_register(0);
   // Start up with interrupts disabled.
   imode = 0;
   iff1 = 0;
   iff2 = 0;
   // Don't start halted or in a delayed DI or EI.
   halted = false;
   do_delayed_di = false;
   do_delayed_ei = false;
   // Obviously we've not used any cycles yet.
   cycle_counter = 0;
};

///////////////////////////////////////////////////////////////////////////////
/// @public run_instruction
///
/// @brief Runs a single instruction
///
/// @return The number of T cycles the instruction took to run,
///          plus any time that went into handling interrupts that fired
///          while this instruction was executing
///////////////////////////////////////////////////////////////////////////////
let run_instruction = function()
{
   if (!halted)
   {
      // If the previous instruction was a DI or an EI,
      //  we'll need to disable or enable interrupts
      //  after whatever instruction we're about to run is finished.
      var doing_delayed_di = false, doing_delayed_ei = false;
      if (do_delayed_di)
      {
         do_delayed_di = false;
         doing_delayed_di = true;
      }
      else if (do_delayed_ei)
      {
         do_delayed_ei = false;
         doing_delayed_ei = true;
      }

      // R is incremented at the start of every instruction cycle,
      //  before the instruction actually runs.
      // The high bit of R is not affected by this increment,
      //  it can only be changed using the LD R, A instruction.
      r = (r & 0x80) | (((r & 0x7f) + 1) & 0x7f);
      
      // Read the byte at the PC and run the instruction it encodes.
      var opcode = core.mem_read(pc);
      decode_instruction(opcode);
      pc = (pc + 1) & 0xffff;
      
      // Actually do the delayed interrupt disable/enable if we have one.
      if (doing_delayed_di)
      {
         iff1 = 0;
         iff2 = 0;
      }
      else if (doing_delayed_ei)
      {
         iff1 = 1;
         iff2 = 1;
      }
      
      // And finally clear out the cycle counter for the next instruction
      //  before returning it to the emulator core.
      var retval = cycle_counter;
      cycle_counter = 0;
      return retval;
   }
   else
   {
      // While we're halted, claim that we spent a cycle doing nothing,
      //  so that the rest of the emulator can still proceed.
      return 1;
   }
};

///////////////////////////////////////////////////////////////////////////////
/// @public interrupt
///
/// @brief Simulates pulsing the processor's INT (or NMI) pin
///
/// @param non_maskable - true if this is a non-maskable interrupt
/// @param data - the value to be placed on the data bus, if needed
///////////////////////////////////////////////////////////////////////////////
let interrupt = function(non_maskable, data)
{
   if (non_maskable)
   {
      // The high bit of R is not affected by this increment,
      //  it can only be changed using the LD R, A instruction.
      r = (r & 0x80) | (((r & 0x7f) + 1) & 0x7f);
      // Non-maskable interrupts are always handled the same way;
      //  clear IFF1 and then do a CALL 0x0066.
      // Also, all interrupts reset the HALT state.
      halted = false;
      iff2 = iff1;
      iff1 = 0;
      push_word(pc);
      pc = 0x66;
      cycle_counter += 11;
   }
   else if (iff1)
   {
      // The high bit of R is not affected by this increment,
      //  it can only be changed using the LD R, A instruction.
      r = (r & 0x80) | (((r & 0x7f) + 1) & 0x7f);
   
      halted = false;
      iff1 = 0;
      iff2 = 0;
   
      if (imode === 0)
      {
         // In the 8080-compatible interrupt mode,
         //  decode the content of the data bus as an instruction and run it.
         // it's probably a RST instruction, which pushes (PC+1) onto the stack
         // so we should decrement PC before we decode the instruction
         pc = (pc - 1) & 0xffff;
         decode_instruction(data);
         pc = (pc + 1) & 0xffff; // increment PC upon return
         cycle_counter += 2;
      }
      else if (imode === 1)
      {
         // Mode 1 is always just RST 0x38.
         push_word(pc);
         pc = 0x38;
         cycle_counter += 13;
      }
      else if (imode === 2)
      {
         // Mode 2 uses the value on the data bus as in index
         //  into the vector table pointer to by the I register.
         push_word(pc);
         // The Z80 manual says that this address must be 2-byte aligned,
         //  but it doesn't appear that this is actually the case on the hardware,
         //  so we don't attempt to enforce that here.
         var vector_address = ((i << 8) | data);
         pc = core.mem_read(vector_address) | 
                   (core.mem_read((vector_address + 1) & 0xffff) << 8);
         
         cycle_counter += 19;
      }
   }
};

///////////////////////////////////////////////////////////////////////////////
/// The public API functions end here.
///
/// What begins here are just general utility functions, used variously.
///////////////////////////////////////////////////////////////////////////////
let decode_instruction = function(opcode)
{
   // The register-to-register loads and ALU instructions
   //  are all so uniform that we can decode them directly
   //  instead of going into the instruction array for them.
   // This function gets the operand for all of these instructions.
   var get_operand = function(opcode)
   {
      return ((opcode & 0x07) === 0) ? b :
             ((opcode & 0x07) === 1) ? c :
             ((opcode & 0x07) === 2) ? d :
             ((opcode & 0x07) === 3) ? e :
             ((opcode & 0x07) === 4) ? h :
             ((opcode & 0x07) === 5) ? l :
             ((opcode & 0x07) === 6) ? core.mem_read(l | (h << 8)) : a;
   };

   // Handle HALT right up front, because it fouls up our LD decoding
   //  by falling where LD (HL), (HL) ought to be.
   if (opcode === 0x76)
   {
      halted = true;
   }
   else if ((opcode >= 0x40) && (opcode < 0x80))
   {
      // This entire range is all 8-bit register loads.
      // Get the operand and assign it to the correct destination.
      var operand = get_operand(opcode);
         
      if (((opcode & 0x38) >>> 3) === 0)
         b = operand;
      else if (((opcode & 0x38) >>> 3) === 1)
         c = operand;
      else if (((opcode & 0x38) >>> 3) === 2)
         d = operand;
      else if (((opcode & 0x38) >>> 3) === 3)
         e = operand;
      else if (((opcode & 0x38) >>> 3) === 4)
         h = operand;
      else if (((opcode & 0x38) >>> 3) === 5)
         l = operand;
      else if (((opcode & 0x38) >>> 3) === 6)
         core.mem_write(l | (h << 8), operand);
      else if (((opcode & 0x38) >>> 3) === 7)
         a = operand;
   }
   else if ((opcode >= 0x80) && (opcode < 0xc0))
   {
      // These are the 8-bit register ALU instructions.
      // We'll get the operand and then use this "jump table"
      //  to call the correct utility function for the instruction.
      var operand = get_operand(opcode),
          op_array = [do_add, do_adc, do_sub, do_sbc,
                      do_and, do_xor, do_or, do_cp];
      
      op_array[(opcode & 0x38) >>> 3]( operand);
   }
   else
   {
      // This is one of the less formulaic instructions;
      //  we'll get the specific function for it from our array.
      var func = instructions[opcode];
      func();
   }
   
   // Update the cycle counter with however many cycles
   //  the base instruction took.
   // If this was a prefixed instruction, then
   //  the prefix handler has added its extra cycles already.
   cycle_counter += cycle_counts[opcode];
};

let get_signed_offset_byte = function(value)
{
   // This function requires some explanation.
   // We just use JavaScript Number variables for our registers,
   //  not like a typed array or anything.
   // That means that, when we have a byte value that's supposed
   //  to represent a signed offset, the value we actually see
   //  isn't signed at all, it's just a small integer.
   // So, this function converts that byte into something JavaScript
   //  will recognize as signed, so we can easily do arithmetic with it.
   // First, we clamp the value to a single byte, just in case.
   value &= 0xff;
   // We don't have to do anything if the value is positive.
   if (value & 0x80)
   {
      // But if the value is negative, we need to manually un-two's-compliment it.
      // I'm going to assume you can figure out what I meant by that,
      //  because I don't know how else to explain it.
      // We could also just do value |= 0xffffff00, but I prefer
      //  not caring how many bits are in the integer representation
      //  of a JavaScript number in the currently running browser.
      value = -((0xff & ~value) + 1);
   }
   return value;
};

let get_flags_register = function()
{
   // We need the whole F register for some reason.
   //  probably a PUSH AF instruction,
   //  so make the F register out of our separate flags.
   return (flags.S << 7) |
          (flags.Z << 6) |
          (flags.Y << 5) |
          (flags.H << 4) |
          (flags.X << 3) |
          (flags.P << 2) |
          (flags.N << 1) |
          (flags.C);
};

let get_flags_prime = function()
{
   // This is the same as the above for the F' register.
   return (flags_prime.S << 7) |
          (flags_prime.Z << 6) |
          (flags_prime.Y << 5) |
          (flags_prime.H << 4) |
          (flags_prime.X << 3) |
          (flags_prime.P << 2) |
          (flags_prime.N << 1) |
          (flags_prime.C);
};

let set_flags_register = function(operand)
{
   // We need to set the F register, probably for a POP AF,
   //  so break out the given value into our separate flags.
   flags.S = (operand & 0x80) >>> 7;
   flags.Z = (operand & 0x40) >>> 6;
   flags.Y = (operand & 0x20) >>> 5;
   flags.H = (operand & 0x10) >>> 4;
   flags.X = (operand & 0x08) >>> 3;
   flags.P = (operand & 0x04) >>> 2;
   flags.N = (operand & 0x02) >>> 1;
   flags.C = (operand & 0x01);
};

let set_flags_prime = function(operand)
{
   // Again, this is the same as the above for F'.
   flags_prime.S = (operand & 0x80) >>> 7;
   flags_prime.Z = (operand & 0x40) >>> 6;
   flags_prime.Y = (operand & 0x20) >>> 5;
   flags_prime.H = (operand & 0x10) >>> 4;
   flags_prime.X = (operand & 0x08) >>> 3;
   flags_prime.P = (operand & 0x04) >>> 2;
   flags_prime.N = (operand & 0x02) >>> 1;
   flags_prime.C = (operand & 0x01);
};

let update_xy_flags = function(result)
{
   // Most of the time, the undocumented flags
   //  (sometimes called X and Y, or 3 and 5),
   //  take their values from the corresponding bits
   //  of the result of the instruction,
   //  or from some other related value.
   // This is a utility function to set those flags based on those bits.
   flags.Y = (result & 0x20) >>> 5;
   flags.X = (result & 0x08) >>> 3;
};

let get_parity = function(value)
{
   // We could try to actually calculate the parity every time,
   //  but why calculate what you can pre-calculate?
   var parity_bits = [
      1, 0, 0, 1, 0, 1, 1, 0, 0, 1, 1, 0, 1, 0, 0, 1,
      0, 1, 1, 0, 1, 0, 0, 1, 1, 0, 0, 1, 0, 1, 1, 0, 
      0, 1, 1, 0, 1, 0, 0, 1, 1, 0, 0, 1, 0, 1, 1, 0, 
      1, 0, 0, 1, 0, 1, 1, 0, 0, 1, 1, 0, 1, 0, 0, 1, 
      0, 1, 1, 0, 1, 0, 0, 1, 1, 0, 0, 1, 0, 1, 1, 0, 
      1, 0, 0, 1, 0, 1, 1, 0, 0, 1, 1, 0, 1, 0, 0, 1, 
      1, 0, 0, 1, 0, 1, 1, 0, 0, 1, 1, 0, 1, 0, 0, 1, 
      0, 1, 1, 0, 1, 0, 0, 1, 1, 0, 0, 1, 0, 1, 1, 0, 
      0, 1, 1, 0, 1, 0, 0, 1, 1, 0, 0, 1, 0, 1, 1, 0, 
      1, 0, 0, 1, 0, 1, 1, 0, 0, 1, 1, 0, 1, 0, 0, 1, 
      1, 0, 0, 1, 0, 1, 1, 0, 0, 1, 1, 0, 1, 0, 0, 1, 
      0, 1, 1, 0, 1, 0, 0, 1, 1, 0, 0, 1, 0, 1, 1, 0, 
      1, 0, 0, 1, 0, 1, 1, 0, 0, 1, 1, 0, 1, 0, 0, 1, 
      0, 1, 1, 0, 1, 0, 0, 1, 1, 0, 0, 1, 0, 1, 1, 0, 
      0, 1, 1, 0, 1, 0, 0, 1, 1, 0, 0, 1, 0, 1, 1, 0, 
      1, 0, 0, 1, 0, 1, 1, 0, 0, 1, 1, 0, 1, 0, 0, 1
   ];
   return parity_bits[value];
};

let push_word = function(operand)
{
   // Pretty obvious what this function does; given a 16-bit value,
   //  decrement the stack pointer, write the high byte to the new
   //  stack pointer location, then repeat for the low byte.
   sp = (sp - 1) & 0xffff;
   core.mem_write(sp, (operand & 0xff00) >>> 8);
   sp = (sp - 1) & 0xffff;
   core.mem_write(sp, operand & 0x00ff);
};

let pop_word = function()
{
   // Again, not complicated; read a byte off the top of the stack,
   //  increment the stack pointer, rinse and repeat.
   var retval = core.mem_read(sp) & 0xff;
   sp = (sp + 1) & 0xffff;
   retval |= core.mem_read(sp) << 8;
   sp = (sp + 1) & 0xffff;
   return retval;
};

///////////////////////////////////////////////////////////////////////////////
/// Now, the way most instructions work in this emulator is that they set up
///  their operands according to their addressing mode, and then they call a
///  utility function that handles all variations of that instruction.
/// Those utility functions begin here.
///////////////////////////////////////////////////////////////////////////////
let do_conditional_absolute_jump = function(condition)
{
   // This function implements the JP [condition],nn instructions.
   if (condition)
   {
      // We're taking this jump, so write the new PC,
      //  and then decrement the thing we just wrote,
      //  because the instruction decoder increments the PC
      //  unconditionally at the end of every instruction
      //  and we need to counteract that so we end up at the jump target.
      pc =  core.mem_read((pc + 1) & 0xffff) |
                (core.mem_read((pc + 2) & 0xffff) << 8);
      pc = (pc - 1) & 0xffff;
   }
   else
   {
      // We're not taking this jump, just move the PC past the operand.
      pc = (pc + 2) & 0xffff;
   }
};

let do_conditional_relative_jump = function(condition)
{
   // This function implements the JR [condition],n instructions.
   if (condition)
   {
      // We need a few more cycles to actually take the jump.
      cycle_counter += 5;
      // Calculate the offset specified by our operand.
      var offset = get_signed_offset_byte(core.mem_read((pc + 1) & 0xffff));
      // Add the offset to the PC, also skipping past this instruction.
      pc = (pc + offset + 1) & 0xffff;
   }
   else
   {
      // No jump happening, just skip the operand.
      pc = (pc + 1) & 0xffff;
   }
};

let do_conditional_call = function(condition)
{
   // This function is the CALL [condition],nn instructions.
   // If you've seen the previous functions, you know this drill.
   if (condition)
   {
      cycle_counter += 7;
      push_word((pc + 3) & 0xffff);
      pc =  core.mem_read((pc + 1) & 0xffff) |
                (core.mem_read((pc + 2) & 0xffff) << 8);
      pc = (pc - 1) & 0xffff;
   }
   else
   {
      pc = (pc + 2) & 0xffff;
   }
};

let do_conditional_return = function(condition)
{
   if (condition)
   {
      cycle_counter += 6;
      pc = (pop_word() - 1) & 0xffff;
   }
};

let do_reset = function(address)
{
   // The RST [address] instructions go through here.
   push_word((pc + 1) & 0xffff);
   pc = (address - 1) & 0xffff;
};

let do_add = function(operand)
{
   // This is the ADD A, [operand] instructions.
   // We'll do the literal addition, which includes any overflow,
   //  so that we can more easily figure out whether we had
   //  an overflow or a carry and set the flags accordingly.
   var result = a + operand;
   
   // The great majority of the work for the arithmetic instructions
   //  turns out to be setting the flags rather than the actual operation.
   flags.S = (result & 0x80) ? 1 : 0;
   flags.Z = !(result & 0xff) ? 1 : 0;
   flags.H = (((operand & 0x0f) + (a & 0x0f)) & 0x10) ? 1 : 0;
   // An overflow has happened if the sign bits of the accumulator and the operand
   //  don't match the sign bit of the result value.
   flags.P = ((a & 0x80) === (operand & 0x80)) && ((a & 0x80) !== (result & 0x80)) ? 1 : 0;
   flags.N = 0;
   flags.C = (result & 0x100) ? 1 : 0;
   
   a = result & 0xff;
   update_xy_flags(a);
};

let do_adc = function(operand)
{
   var result = a + operand + flags.C;
   
   flags.S = (result & 0x80) ? 1 : 0;
   flags.Z = !(result & 0xff) ? 1 : 0;
   flags.H = (((operand & 0x0f) + (a & 0x0f) + flags.C) & 0x10) ? 1 : 0;
   flags.P = ((a & 0x80) === (operand & 0x80)) && ((a & 0x80) !== (result & 0x80)) ? 1 : 0;
   flags.N = 0;
   flags.C = (result & 0x100) ? 1 : 0;
   
   a = result & 0xff;
   update_xy_flags(a);
};

let do_sub = function(operand)
{
   var result = a - operand;
   
   flags.S = (result & 0x80) ? 1 : 0;
   flags.Z = !(result & 0xff) ? 1 : 0;
   flags.H = (((a & 0x0f) - (operand & 0x0f)) & 0x10) ? 1 : 0;
   flags.P = ((a & 0x80) !== (operand & 0x80)) && ((a & 0x80) !== (result & 0x80)) ? 1 : 0;
   flags.N = 1;
   flags.C = (result & 0x100) ? 1 : 0;
   
   a = result & 0xff;
   update_xy_flags(a);
};

let do_sbc = function(operand)
{
   var result = a - operand - flags.C;
   
   flags.S = (result & 0x80) ? 1 : 0;
   flags.Z = !(result & 0xff) ? 1 : 0;
   flags.H = (((a & 0x0f) - (operand & 0x0f) - flags.C) & 0x10) ? 1 : 0;
   flags.P = ((a & 0x80) !== (operand & 0x80)) && ((a & 0x80) !== (result & 0x80)) ? 1 : 0;
   flags.N = 1;
   flags.C = (result & 0x100) ? 1 : 0;
   
   a = result & 0xff;
   update_xy_flags(a);
};

let do_cp = function(operand)
{
   // A compare instruction is just a subtraction that doesn't save the value,
   //  so we implement it as... a subtraction that doesn't save the value.
   var temp = a;
   do_sub(operand);
   a = temp;
   // Since this instruction has no "result" value, the undocumented flags
   //  are set based on the operand instead.
   update_xy_flags(operand);
};

let do_and = function(operand)
{
   // The logic instructions are all pretty straightforward.
   a &= operand & 0xff;
   flags.S = (a & 0x80) ? 1 : 0;
   flags.Z = !a ? 1 : 0;
   flags.H = 1;
   flags.P = get_parity(a);
   flags.N = 0;
   flags.C = 0;
   update_xy_flags(a);
};

let do_or = function(operand)
{
   a = (operand | a) & 0xff;
   flags.S = (a & 0x80) ? 1 : 0;
   flags.Z = !a ? 1 : 0;
   flags.H = 0;
   flags.P = get_parity(a);
   flags.N = 0;
   flags.C = 0;
   update_xy_flags(a);
};

let do_xor = function(operand)
{
   a = (operand ^ a) & 0xff;
   flags.S = (a & 0x80) ? 1 : 0;
   flags.Z = !a ? 1 : 0;
   flags.H = 0;
   flags.P = get_parity(a);
   flags.N = 0;
   flags.C = 0;
   update_xy_flags(a);
};

let do_inc = function(operand)
{
   var result = operand + 1;
   
   flags.S = (result & 0x80) ? 1 : 0;
   flags.Z = !(result & 0xff) ? 1 : 0;
   flags.H = ((operand & 0x0f) === 0x0f) ? 1 : 0;
   // It's a good deal easier to detect overflow for an increment/decrement.
   flags.P = (operand === 0x7f) ? 1 : 0;
   flags.N = 0;
   
   result &= 0xff;
   update_xy_flags(result);
   
   return result;
};

let do_dec = function(operand)
{
   var result = operand - 1;
   
   flags.S = (result & 0x80) ? 1 : 0;
   flags.Z = !(result & 0xff) ? 1 : 0;
   flags.H = ((operand & 0x0f) === 0x00) ? 1 : 0;
   flags.P = (operand === 0x80) ? 1 : 0;
   flags.N = 1;
   
   result &= 0xff;
   update_xy_flags(result);
   
   return result;
};

let do_hl_add = function(operand)
{
   // The HL arithmetic instructions are the same as the A ones,
   //  just with twice as many bits happening.
   var hl = l | (h << 8), result = hl + operand;
   
   flags.N = 0;
   flags.C = (result & 0x10000) ? 1 : 0;
   flags.H = (((hl & 0x0fff) + (operand & 0x0fff)) & 0x1000) ? 1 : 0;
   
   l = result & 0xff;
   h = (result & 0xff00) >>> 8;

   update_xy_flags(h);
};

let do_hl_adc = function(operand)
{
   operand += flags.C;
   var hl = l | (h << 8), result = hl + operand;
   
   flags.S = (result & 0x8000) ? 1 : 0;
   flags.Z = !(result & 0xffff) ? 1 : 0;
   flags.H = (((hl & 0x0fff) + (operand & 0x0fff)) & 0x1000) ? 1 : 0;
   flags.P = ((hl & 0x8000) === (operand & 0x8000)) && ((result & 0x8000) !== (hl & 0x8000)) ? 1 : 0;
   flags.N = 0;
   flags.C = (result & 0x10000) ? 1 : 0;
   
   l = result & 0xff;
   h = (result >>> 8) & 0xff;
   
   update_xy_flags(h);
};

let do_hl_sbc = function(operand)
{
   operand += flags.C;
   var hl = l | (h << 8), result = hl - operand;
   
   flags.S = (result & 0x8000) ? 1 : 0;
   flags.Z = !(result & 0xffff) ? 1 : 0;
   flags.H = (((hl & 0x0fff) - (operand & 0x0fff)) & 0x1000) ? 1 : 0;
   flags.P = ((hl & 0x8000) !== (operand & 0x8000)) && ((result & 0x8000) !== (hl & 0x8000)) ? 1 : 0;
   flags.N = 1;
   flags.C = (result & 0x10000) ? 1 : 0;
   
   l = result & 0xff;
   h = (result >>> 8) & 0xff;
   
   update_xy_flags(h);
};

let do_in = function(port)
{
   var result = core.io_read(port);
   
   flags.S = (result & 0x80) ? 1 : 0;
   flags.Z = result ? 0 : 1;
   flags.H = 0;
   flags.P = get_parity(result) ? 1 : 0;
   flags.N = 0;
   update_xy_flags(result);
   
   return result;
};

let do_neg = function()
{
   // This instruction is defined to not alter the register if it === 0x80.
   if (a !== 0x80)
   {
      // This is a signed operation, so convert A to a signed value.
      a = get_signed_offset_byte(a);
      
      a = (-a) & 0xff;
   }
   
   flags.S = (a & 0x80) ? 1 : 0;
   flags.Z = !a ? 1 : 0;
   flags.H = (((-a) & 0x0f) > 0) ? 1 : 0;
   flags.P = (a === 0x80) ? 1 : 0;
   flags.N = 1;
   flags.C = a ? 1 : 0;
   update_xy_flags(a);
};

let do_ldi = function()
{
   // Copy the value that we're supposed to copy.
   var read_value = core.mem_read(l | (h << 8));
   core.mem_write(e | (d << 8), read_value);
   
   // Increment DE and HL, and decrement BC.
   var result = (e | (d << 8)) + 1;
   e = result & 0xff;
   d = (result & 0xff00) >>> 8;
   result = (l | (h << 8)) + 1;
   l = result & 0xff;
   h = (result & 0xff00) >>> 8;
   result = (c | (b << 8)) - 1;
   c = result & 0xff;
   b = (result & 0xff00) >>> 8;
   
   flags.H = 0;
   flags.P = (c || b) ? 1 : 0;
   flags.N = 0;
   flags.Y = ((a + read_value) & 0x02) >>> 1;
   flags.X = ((a + read_value) & 0x08) >>> 3;
};

let do_cpi = function()
{
   var temp_carry = flags.C;
   var read_value = core.mem_read(l | (h << 8))
   do_cp(read_value);
   flags.C = temp_carry;
   flags.Y = ((a - read_value - flags.H) & 0x02) >>> 1;
   flags.X = ((a - read_value - flags.H) & 0x08) >>> 3;
   
   var result = (l | (h << 8)) + 1;
   l = result & 0xff;
   h = (result & 0xff00) >>> 8;
   result = (c | (b << 8)) - 1;
   c = result & 0xff;
   b = (result & 0xff00) >>> 8;
   
   flags.P = result ? 1 : 0;
};

let do_ini = function()
{
   b = do_dec(b);
   
   core.mem_write(l | (h << 8), core.io_read((b << 8) | c));
   
   var result = (l | (h << 8)) + 1;
   l = result & 0xff;
   h = (result & 0xff00) >>> 8;

   flags.N = 1;
};

let do_outi = function()
{
   core.io_write((b << 8) | c, core.mem_read(l | (h << 8)));
   
   var result = (l | (h << 8)) + 1;
   l = result & 0xff;
   h = (result & 0xff00) >>> 8;
   
   b = do_dec(b);
   flags.N = 1;
};

let do_ldd = function()
{
   flags.N = 0;
   flags.H = 0;
   
   var read_value = core.mem_read(l | (h << 8));
   core.mem_write(e | (d << 8), read_value);
   
   var result = (e | (d << 8)) - 1;
   e = result & 0xff;
   d = (result & 0xff00) >>> 8;
   result = (l | (h << 8)) - 1;
   l = result & 0xff;
   h = (result & 0xff00) >>> 8;
   result = (c | (b << 8)) - 1;
   c = result & 0xff;
   b = (result & 0xff00) >>> 8;
   
   flags.P = (c || b) ? 1 : 0;
   flags.Y = ((a + read_value) & 0x02) >>> 1;
   flags.X = ((a + read_value) & 0x08) >>> 3;
};

let do_cpd = function()
{
   var temp_carry = flags.C
   var read_value = core.mem_read(l | (h << 8))
   do_cp(read_value);
   flags.C = temp_carry;
   flags.Y = ((a - read_value - flags.H) & 0x02) >>> 1;
   flags.X = ((a - read_value - flags.H) & 0x08) >>> 3;
   
   var result = (l | (h << 8)) - 1;
   l = result & 0xff;
   h = (result & 0xff00) >>> 8;
   result = (c | (b << 8)) - 1;
   c = result & 0xff;
   b = (result & 0xff00) >>> 8;
   
   flags.P = result ? 1 : 0;
};

let do_ind = function()
{
   b = do_dec(b);
   
   core.mem_write(l | (h << 8), core.io_read((b << 8) | c));
   
   var result = (l | (h << 8)) - 1;
   l = result & 0xff;
   h = (result & 0xff00) >>> 8;
   
   flags.N = 1;
};

let do_outd = function()
{
   core.io_write((b << 8) | c, core.mem_read(l | (h << 8)));
   
   var result = (l | (h << 8)) - 1;
   l = result & 0xff;
   h = (result & 0xff00) >>> 8;
   
   b = do_dec(b);
   flags.N = 1;
};

let do_rlc = function(operand)
{
   flags.N = 0;
   flags.H = 0;
   
   flags.C = (operand & 0x80) >>> 7;
   operand = ((operand << 1) | flags.C) & 0xff;
   
   flags.Z = !operand ? 1 : 0;
   flags.P = get_parity(operand);
   flags.S = (operand & 0x80) ? 1 : 0;
   update_xy_flags(operand);
   
   return operand;
};

let do_rrc = function(operand)
{
   flags.N = 0;
   flags.H = 0;
   
   flags.C = operand & 1;
   operand = ((operand >>> 1) & 0x7f) | (flags.C << 7);
   
   flags.Z = !(operand & 0xff) ? 1 : 0;
   flags.P = get_parity(operand);
   flags.S = (operand & 0x80) ? 1 : 0;
   update_xy_flags(operand);
   
   return operand & 0xff;
};

let do_rl = function(operand)
{
   flags.N = 0;
   flags.H = 0;
   
   var temp = flags.C;
   flags.C = (operand & 0x80) >>> 7;
   operand = ((operand << 1) | temp) & 0xff;
   
   flags.Z = !operand ? 1 : 0;
   flags.P = get_parity(operand);
   flags.S = (operand & 0x80) ? 1 : 0;
   update_xy_flags(operand);

   return operand;
};

let do_rr = function(operand)
{
   flags.N = 0;
   flags.H = 0;
   
   var temp = flags.C;
   flags.C = operand & 1;
   operand = ((operand >>> 1) & 0x7f) | (temp << 7);
   
   flags.Z = !operand ? 1 : 0;
   flags.P = get_parity(operand);
   flags.S = (operand & 0x80) ? 1 : 0;
   update_xy_flags(operand);

   return operand;
};

let do_sla = function(operand)
{
   flags.N = 0;
   flags.H = 0;
   
   flags.C = (operand & 0x80) >>> 7;
   operand = (operand << 1) & 0xff;
   
   flags.Z = !operand ? 1 : 0;
   flags.P = get_parity(operand);
   flags.S = (operand & 0x80) ? 1 : 0;
   update_xy_flags(operand);
   
   return operand;
};

let do_sra = function(operand)
{
   flags.N = 0;
   flags.H = 0;
   
   flags.C = operand & 1;
   operand = ((operand >>> 1) & 0x7f) | (operand & 0x80);
   
   flags.Z = !operand ? 1 : 0;
   flags.P = get_parity(operand);
   flags.S = (operand & 0x80) ? 1 : 0;
   update_xy_flags(operand);
   
   return operand;
};

let do_sll = function(operand)
{
   flags.N = 0;
   flags.H = 0;
   
   flags.C = (operand & 0x80) >>> 7;
   operand = ((operand << 1) & 0xff) | 1;
   
   flags.Z = !operand ? 1 : 0;
   flags.P = get_parity(operand);
   flags.S = (operand & 0x80) ? 1 : 0;
   update_xy_flags(operand);
   
   return operand;
};

let do_srl = function(operand)
{
   flags.N = 0;
   flags.H = 0;
   
   flags.C = operand & 1;
   operand = (operand >>> 1) & 0x7f;
   
   flags.Z = !operand ? 1 : 0;
   flags.P = get_parity(operand);
   flags.S = 0;
   update_xy_flags(operand);
   
   return operand;
};

let do_ix_add = function(operand)
{
   flags.N = 0;
   
   var result = ix + operand;
   
   flags.C = (result & 0x10000) ? 1 : 0;
   flags.H = (((ix & 0xfff) + (operand & 0xfff)) & 0x1000) ? 1 : 0;
   update_xy_flags((result & 0xff00) >>> 8);
   
   ix = result;
};


///////////////////////////////////////////////////////////////////////////////
/// This table contains the implementations for the instructions that weren't
///  implemented directly in the decoder function (everything but the 8-bit
///  register loads and the accumulator ALU instructions, in other words).
/// Similar tables for the ED and DD/FD prefixes follow this one.
///////////////////////////////////////////////////////////////////////////////
let instructions = [];

// 0x00 : NOP
instructions[0x00] = function() { };
// 0x01 : LD BC, nn
instructions[0x01] = function()
{
   pc = (pc + 1) & 0xffff;
   c = core.mem_read(pc);
   pc = (pc + 1) & 0xffff;
   b = core.mem_read(pc);
};
// 0x02 : LD (BC), A
instructions[0x02] = function()
{
   core.mem_write(c | (b << 8), a);
};
// 0x03 : INC BC
instructions[0x03] = function()
{
   var result = (c | (b << 8));
   result += 1;
   c = result & 0xff;
   b = (result & 0xff00) >>> 8;
};
// 0x04 : INC B
instructions[0x04] = function()
{
   b = do_inc(b);
};
// 0x05 : DEC B
instructions[0x05] = function()
{
   b = do_dec(b);
};
// 0x06 : LD B, n
instructions[0x06] = function()
{
   pc = (pc + 1) & 0xffff;
   b = core.mem_read(pc);
};
// 0x07 : RLCA
instructions[0x07] = function()
{
   // This instruction is implemented as a special case of the
   //  more general Z80-specific RLC instruction.
   // Specifially, RLCA is a version of RLC A that affects fewer flags.
   // The same applies to RRCA, RLA, and RRA.
   var temp_s = flags.S, temp_z = flags.Z, temp_p = flags.P;
   a = do_rlc(a);
   flags.S = temp_s;
   flags.Z = temp_z;
   flags.P = temp_p;
};
// 0x08 : EX AF, AF'
instructions[0x08] = function()
{
   var temp = a;
   a = a_prime;
   a_prime = temp;
   
   temp = get_flags_register();
   set_flags_register(get_flags_prime());
   set_flags_prime(temp);
};
// 0x09 : ADD HL, BC
instructions[0x09] = function()
{
   do_hl_add(c | (b << 8));
};
// 0x0a : LD A, (BC)
instructions[0x0a] = function()
{
   a = core.mem_read(c | (b << 8));
};
// 0x0b : DEC BC
instructions[0x0b] = function()
{
   var result = (c | (b << 8));
   result -= 1;
   c = result & 0xff;
   b = (result & 0xff00) >>> 8;
};
// 0x0c : INC C
instructions[0x0c] = function()
{
   c = do_inc(c);
};
// 0x0d : DEC C
instructions[0x0d] = function()
{
   c = do_dec(c);
};
// 0x0e : LD C, n
instructions[0x0e] = function()
{
   pc = (pc + 1) & 0xffff;
   c = core.mem_read(pc);
};
// 0x0f : RRCA
instructions[0x0f] = function()
{
   var temp_s = flags.S, temp_z = flags.Z, temp_p = flags.P;
   a = do_rrc(a);
   flags.S = temp_s;
   flags.Z = temp_z;
   flags.P = temp_p;
};
// 0x10 : DJNZ nn
instructions[0x10] = function()
{
   b = (b - 1) & 0xff;
   do_conditional_relative_jump(b !== 0);
};
// 0x11 : LD DE, nn
instructions[0x11] = function()
{
   pc = (pc + 1) & 0xffff;
   e = core.mem_read(pc);
   pc = (pc + 1) & 0xffff;
   d = core.mem_read(pc);
};
// 0x12 : LD (DE), A
instructions[0x12] = function()
{
   core.mem_write(e | (d << 8), a);
};
// 0x13 : INC DE
instructions[0x13] = function()
{
   var result = (e | (d << 8));
   result += 1;
   e = result & 0xff;
   d = (result & 0xff00) >>> 8;
};
// 0x14 : INC D
instructions[0x14] = function()
{
   d = do_inc(d);
};
// 0x15 : DEC D
instructions[0x15] = function()
{
   d = do_dec(d);
};
// 0x16 : LD D, n
instructions[0x16] = function()
{
   pc = (pc + 1) & 0xffff;
   d = core.mem_read(pc);
};
// 0x17 : RLA
instructions[0x17] = function()
{
   var temp_s = flags.S, temp_z = flags.Z, temp_p = flags.P;
   a = do_rl(a);
   flags.S = temp_s;
   flags.Z = temp_z;
   flags.P = temp_p;
};
// 0x18 : JR n
instructions[0x18] = function()
{
   var offset = get_signed_offset_byte(core.mem_read((pc + 1) & 0xffff));
   pc = (pc + offset + 1) & 0xffff;
};
// 0x19 : ADD HL, DE
instructions[0x19] = function()
{
   do_hl_add(e | (d << 8));
};
// 0x1a : LD A, (DE)
instructions[0x1a] = function()
{
   a = core.mem_read(e | (d << 8));
};
// 0x1b : DEC DE
instructions[0x1b] = function()
{
   var result = (e | (d << 8));
   result -= 1;
   e = result & 0xff;
   d = (result & 0xff00) >>> 8;
};
// 0x1c : INC E
instructions[0x1c] = function()
{
   e = do_inc(e);
};
// 0x1d : DEC E
instructions[0x1d] = function()
{
   e = do_dec(e);
};
// 0x1e : LD E, n
instructions[0x1e] = function()
{
   pc = (pc + 1) & 0xffff;
   e = core.mem_read(pc);
};
// 0x1f : RRA
instructions[0x1f] = function()
{
   var temp_s = flags.S, temp_z = flags.Z, temp_p = flags.P;
   a = do_rr(a);
   flags.S = temp_s;
   flags.Z = temp_z;
   flags.P = temp_p;
};
// 0x20 : JR NZ, n
instructions[0x20] = function()
{
   do_conditional_relative_jump(!flags.Z);
};
// 0x21 : LD HL, nn
instructions[0x21] = function()
{
   pc = (pc + 1) & 0xffff;
   l = core.mem_read(pc);
   pc = (pc + 1) & 0xffff;
   h = core.mem_read(pc);
};
// 0x22 : LD (nn), HL
instructions[0x22] = function()
{
   pc = (pc + 1) & 0xffff;
   var address = core.mem_read(pc);
   pc = (pc + 1) & 0xffff;
   address |= core.mem_read(pc) << 8;
   
   core.mem_write(address, l);
   core.mem_write((address + 1) & 0xffff, h);
};
// 0x23 : INC HL
instructions[0x23] = function()
{
   var result = (l | (h << 8));
   result += 1;
   l = result & 0xff;
   h = (result & 0xff00) >>> 8;
};
// 0x24 : INC H
instructions[0x24] = function()
{
   h = do_inc(h);
};
// 0x25 : DEC H
instructions[0x25] = function()
{
   h = do_dec(h);
};
// 0x26 : LD H, n
instructions[0x26] = function()
{
   pc = (pc + 1) & 0xffff;
   h = core.mem_read(pc);
};
// 0x27 : DAA
instructions[0x27] = function()
{
   var temp = a;
   if (!flags.N)
   {
      if (flags.H || ((a & 0x0f) > 9))
         temp += 0x06;
      if (flags.C || (a > 0x99))
         temp += 0x60;
   }
   else
   {
      if (flags.H || ((a & 0x0f) > 9))
         temp -= 0x06;
      if (flags.C || (a > 0x99))
         temp -= 0x60;
   }
   
   flags.S = (temp & 0x80) ? 1 : 0;
   flags.Z = !(temp & 0xff) ? 1 : 0;
   flags.H = ((a & 0x10) ^ (temp & 0x10)) ? 1 : 0;
   flags.P = get_parity(temp & 0xff);
   // DAA never clears the carry flag if it was already set,
   //  but it is able to set the carry flag if it was clear.
   // Don't ask me, I don't know.
   // Note also that we check for a BCD carry, instead of the usual.
   flags.C = (flags.C || (a > 0x99)) ? 1 : 0;
   
   a = temp & 0xff;
   
   update_xy_flags(a);
};
// 0x28 : JR Z, n
instructions[0x28] = function()
{
   do_conditional_relative_jump(!!flags.Z);
};
// 0x29 : ADD HL, HL
instructions[0x29] = function()
{
   do_hl_add(l | (h << 8));
};
// 0x2a : LD HL, (nn)
instructions[0x2a] = function()
{
   pc = (pc + 1) & 0xffff;
   var address = core.mem_read(pc);
   pc = (pc + 1) & 0xffff;
   address |= core.mem_read(pc) << 8;
   
   l = core.mem_read(address);
   h = core.mem_read((address + 1) & 0xffff);
};
// 0x2b : DEC HL
instructions[0x2b] = function()
{
   var result = (l | (h << 8));
   result -= 1;
   l = result & 0xff;
   h = (result & 0xff00) >>> 8;
};
// 0x2c : INC L
instructions[0x2c] = function()
{
   l = do_inc(l);
};
// 0x2d : DEC L
instructions[0x2d] = function()
{
   l = do_dec(l);
};
// 0x2e : LD L, n
instructions[0x2e] = function()
{
   pc = (pc + 1) & 0xffff;
   l = core.mem_read(pc);
};
// 0x2f : CPL
instructions[0x2f] = function()
{
   a = (~a) & 0xff;
   flags.N = 1;
   flags.H = 1;
   update_xy_flags(a);
};
// 0x30 : JR NC, n
instructions[0x30] = function()
{
   do_conditional_relative_jump(!flags.C);
};
// 0x31 : LD SP, nn
instructions[0x31] = function()
{
   sp =  core.mem_read((pc + 1) & 0xffff) | 
            (core.mem_read((pc + 2) & 0xffff) << 8);
   pc = (pc + 2) & 0xffff;
};
// 0x32 : LD (nn), A
instructions[0x32] = function()
{
   pc = (pc + 1) & 0xffff;
   var address = core.mem_read(pc);
   pc = (pc + 1) & 0xffff;
   address |= core.mem_read(pc) << 8;
   
   core.mem_write(address, a);
};
// 0x33 : INC SP
instructions[0x33] = function()
{
   sp = (sp + 1) & 0xffff;
};
// 0x34 : INC (HL)
instructions[0x34] = function()
{
   var address = l | (h << 8);
   core.mem_write(address, do_inc(core.mem_read(address)));
};
// 0x35 : DEC (HL)
instructions[0x35] = function()
{
   var address = l | (h << 8);
   core.mem_write(address, do_dec(core.mem_read(address)));
};
// 0x36 : LD (HL), n
instructions[0x36] = function()
{
   pc = (pc + 1) & 0xffff;
   core.mem_write(l | (h << 8), core.mem_read(pc));
};
// 0x37 : SCF
instructions[0x37] = function()
{
   flags.N = 0;
   flags.H = 0;
   flags.C = 1;
   update_xy_flags(a);
};
// 0x38 : JR C, n
instructions[0x38] = function()
{
   do_conditional_relative_jump(!!flags.C);
};
// 0x39 : ADD HL, SP
instructions[0x39] = function()
{
   do_hl_add(sp);
};
// 0x3a : LD A, (nn)
instructions[0x3a] = function()
{
   pc = (pc + 1) & 0xffff;
   var address = core.mem_read(pc);
   pc = (pc + 1) & 0xffff;
   address |= core.mem_read(pc) << 8;
   
   a = core.mem_read(address);
};
// 0x3b : DEC SP
instructions[0x3b] = function()
{
   sp = (sp - 1) & 0xffff;
};
// 0x3c : INC A
instructions[0x3c] = function()
{
   a = do_inc(a);
};
// 0x3d : DEC A
instructions[0x3d] = function()
{
   a = do_dec(a);
};
// 0x3e : LD A, n
instructions[0x3e] = function()
{
   a = core.mem_read((pc + 1) & 0xffff);
   pc = (pc + 1) & 0xffff;
};
// 0x3f : CCF
instructions[0x3f] = function()
{
   flags.N = 0;
   flags.H = flags.C;
   flags.C = flags.C ? 0 : 1;
   update_xy_flags(a);
};
// 0xc0 : RET NZ
instructions[0xc0] = function()
{
   do_conditional_return(!flags.Z);
};
// 0xc1 : POP BC
instructions[0xc1] = function()
{
   var result = pop_word();
   c = result & 0xff;
   b = (result & 0xff00) >>> 8;
};
// 0xc2 : JP NZ, nn
instructions[0xc2] = function()
{
   do_conditional_absolute_jump(!flags.Z);
};
// 0xc3 : JP nn
instructions[0xc3] = function()
{
   pc =  core.mem_read((pc + 1) & 0xffff) |
            (core.mem_read((pc + 2) & 0xffff) << 8);
   pc = (pc - 1) & 0xffff;
};
// 0xc4 : CALL NZ, nn
instructions[0xc4] = function()
{
   do_conditional_call(!flags.Z);
};
// 0xc5 : PUSH BC
instructions[0xc5] = function()
{
   push_word(c | (b << 8));
};
// 0xc6 : ADD A, n
instructions[0xc6] = function()
{
   pc = (pc + 1) & 0xffff;
   do_add(core.mem_read(pc));
};
// 0xc7 : RST 00h
instructions[0xc7] = function()
{
   do_reset(0x00);
};
// 0xc8 : RET Z
instructions[0xc8] = function()
{
   do_conditional_return(!!flags.Z);
};
// 0xc9 : RET
instructions[0xc9] = function()
{
   pc = (pop_word() - 1) & 0xffff;
};
// 0xca : JP Z, nn
instructions[0xca] = function()
{
   do_conditional_absolute_jump(!!flags.Z);
};
// 0xcb : CB Prefix
instructions[0xcb] = function()
{
   // R is incremented at the start of the second instruction cycle,
   //  before the instruction actually runs.
   // The high bit of R is not affected by this increment,
   //  it can only be changed using the LD R, A instruction.
   r = (r & 0x80) | (((r & 0x7f) + 1) & 0x7f);

   // We don't have a table for this prefix,
   //  the instructions are all so uniform that we can directly decode them.
   pc = (pc + 1) & 0xffff;
   var opcode = core.mem_read(pc),
       bit_number = (opcode & 0x38) >>> 3,
       reg_code = opcode & 0x07;
   
   if (opcode < 0x40)
   {
      // Shift/rotate instructions
      var op_array = [do_rlc, do_rrc, do_rl, do_rr,
                      do_sla, do_sra, do_sll, do_srl];
      
      if (reg_code === 0)
         b = op_array[bit_number]( b);
      else if (reg_code === 1)
         c = op_array[bit_number]( c);
      else if (reg_code === 2)
         d = op_array[bit_number]( d);
      else if (reg_code === 3)
         e = op_array[bit_number]( e);
      else if (reg_code === 4)
         h = op_array[bit_number]( h);
      else if (reg_code === 5)
         l = op_array[bit_number]( l);
      else if (reg_code === 6)
         core.mem_write(l | (h << 8),
                            op_array[bit_number]( core.mem_read(l | (h << 8))));
      else if (reg_code === 7)
         a = op_array[bit_number]( a);
   }
   else if (opcode < 0x80)
   {
      // BIT instructions
      if (reg_code === 0)
         flags.Z = !(b & (1 << bit_number)) ? 1 : 0;
      else if (reg_code === 1)
         flags.Z = !(c & (1 << bit_number)) ? 1 : 0;
      else if (reg_code === 2)
         flags.Z = !(d & (1 << bit_number)) ? 1 : 0;
      else if (reg_code === 3)
         flags.Z = !(e & (1 << bit_number)) ? 1 : 0;
      else if (reg_code === 4)
         flags.Z = !(h & (1 << bit_number)) ? 1 : 0;
      else if (reg_code === 5)
         flags.Z = !(l & (1 << bit_number)) ? 1 : 0;
      else if (reg_code === 6)
         flags.Z = !((core.mem_read(l | (h << 8))) & (1 << bit_number)) ? 1 : 0;
      else if (reg_code === 7)
         flags.Z = !(a & (1 << bit_number)) ? 1 : 0;
         
      flags.N = 0;
      flags.H = 1;
      flags.P = flags.Z;
      flags.S = ((bit_number === 7) && !flags.Z) ? 1 : 0;
      // For the BIT n, (HL) instruction, the X and Y flags are obtained
      //  from what is apparently an internal temporary register used for
      //  some of the 16-bit arithmetic instructions.
      // I haven't implemented that register here,
      //  so for now we'll set X and Y the same way for every BIT opcode,
      //  which means that they will usually be wrong for BIT n, (HL).
      flags.Y = ((bit_number === 5) && !flags.Z) ? 1 : 0;
      flags.X = ((bit_number === 3) && !flags.Z) ? 1 : 0;
   }
   else if (opcode < 0xc0)
   {
      // RES instructions
      if (reg_code === 0)
         b &= (0xff & ~(1 << bit_number));
      else if (reg_code === 1)
         c &= (0xff & ~(1 << bit_number));
      else if (reg_code === 2)
         d &= (0xff & ~(1 << bit_number));
      else if (reg_code === 3)
         e &= (0xff & ~(1 << bit_number));
      else if (reg_code === 4)
         h &= (0xff & ~(1 << bit_number));
      else if (reg_code === 5)
         l &= (0xff & ~(1 << bit_number));
      else if (reg_code === 6)
         core.mem_write(l | (h << 8),
                            core.mem_read(l | (h << 8)) & ~(1 << bit_number));
      else if (reg_code === 7)
         a &= (0xff & ~(1 << bit_number));
   }
   else
   {
      // SET instructions
      if (reg_code === 0)
         b |= (1 << bit_number);
      else if (reg_code === 1)
         c |= (1 << bit_number);
      else if (reg_code === 2)
         d |= (1 << bit_number);
      else if (reg_code === 3)
         e |= (1 << bit_number);
      else if (reg_code === 4)
         h |= (1 << bit_number);
      else if (reg_code === 5)
         l |= (1 << bit_number);
      else if (reg_code === 6)
         core.mem_write(l | (h << 8),
                            core.mem_read(l | (h << 8)) | (1 << bit_number));
      else if (reg_code === 7)
         a |= (1 << bit_number);
   }
   
   cycle_counter += cycle_counts_cb[opcode];
};
// 0xcc : CALL Z, nn
instructions[0xcc] = function()
{
   do_conditional_call(!!flags.Z);
};
// 0xcd : CALL nn
instructions[0xcd] = function()
{
   push_word((pc + 3) & 0xffff);
   pc =  core.mem_read((pc + 1) & 0xffff) |
            (core.mem_read((pc + 2) & 0xffff) << 8);
   pc = (pc - 1) & 0xffff;
};
// 0xce : ADC A, n
instructions[0xce] = function()
{
   pc = (pc + 1) & 0xffff;
   do_adc(core.mem_read(pc));
};
// 0xcf : RST 08h
instructions[0xcf] = function()
{
   do_reset(0x08);
};
// 0xd0 : RET NC
instructions[0xd0] = function()
{
   do_conditional_return(!flags.C);
};
// 0xd1 : POP DE
instructions[0xd1] = function()
{
   var result = pop_word();
   e = result & 0xff;
   d = (result & 0xff00) >>> 8;
};
// 0xd2 : JP NC, nn
instructions[0xd2] = function()
{
   do_conditional_absolute_jump(!flags.C);
};
// 0xd3 : OUT (n), A
instructions[0xd3] = function()
{
   pc = (pc + 1) & 0xffff;
   core.io_write((a << 8) | core.mem_read(pc), a);
};
// 0xd4 : CALL NC, nn
instructions[0xd4] = function()
{
   do_conditional_call(!flags.C);
};
// 0xd5 : PUSH DE
instructions[0xd5] = function()
{
   push_word(e | (d << 8));
};
// 0xd6 : SUB n
instructions[0xd6] = function()
{
   pc = (pc + 1) & 0xffff;
   do_sub(core.mem_read(pc));
};
// 0xd7 : RST 10h
instructions[0xd7] = function()
{
   do_reset(0x10);
};
// 0xd8 : RET C
instructions[0xd8] = function()
{
   do_conditional_return(!!flags.C);
};
// 0xd9 : EXX
instructions[0xd9] = function()
{
   var temp = b;
   b = b_prime;
   b_prime = temp;
   temp = c;
   c = c_prime;
   c_prime = temp;
   temp = d;
   d = d_prime;
   d_prime = temp;
   temp = e;
   e = e_prime;
   e_prime = temp;
   temp = h;
   h = h_prime;
   h_prime = temp;
   temp = l;
   l = l_prime;
   l_prime = temp;
};
// 0xda : JP C, nn
instructions[0xda] = function()
{
   do_conditional_absolute_jump(!!flags.C);
};
// 0xdb : IN A, (n)
instructions[0xdb] = function()
{
   pc = (pc + 1) & 0xffff;
   a = core.io_read((a << 8) | core.mem_read(pc));
};
// 0xdc : CALL C, nn
instructions[0xdc] = function()
{
   do_conditional_call(!!flags.C);
};
// 0xdd : DD Prefix (IX instructions)
instructions[0xdd] = function()
{
   // R is incremented at the start of the second instruction cycle,
   //  before the instruction actually runs.
   // The high bit of R is not affected by this increment,
   //  it can only be changed using the LD R, A instruction.
   r = (r & 0x80) | (((r & 0x7f) + 1) & 0x7f);

   pc = (pc + 1) & 0xffff;
   var opcode = core.mem_read(pc),
       func = dd_instructions[opcode];
       
   if (func)
   {
      //func = func.bind(this);
      func();
      cycle_counter += cycle_counts_dd[opcode];
   }
   else
   {
      // Apparently if a DD opcode doesn't exist,
      //  it gets treated as an unprefixed opcode.
      // What we'll do to handle that is just back up the 
      //  program counter, so that this byte gets decoded
      //  as a normal instruction.
      pc = (pc - 1) & 0xffff;
      // And we'll add in the cycle count for a NOP.
      cycle_counter += cycle_counts[0];
   }
};
// 0xde : SBC n
instructions[0xde] = function()
{
   pc = (pc + 1) & 0xffff;
   do_sbc(core.mem_read(pc));
};
// 0xdf : RST 18h
instructions[0xdf] = function()
{
   do_reset(0x18);
};
// 0xe0 : RET PO
instructions[0xe0] = function()
{
   do_conditional_return(!flags.P);
};
// 0xe1 : POP HL
instructions[0xe1] = function()
{
   var result = pop_word();
   l = result & 0xff;
   h = (result & 0xff00) >>> 8;
};
// 0xe2 : JP PO, (nn)
instructions[0xe2] = function()
{
   do_conditional_absolute_jump(!flags.P);
};
// 0xe3 : EX (SP), HL
instructions[0xe3] = function()
{
   var temp = core.mem_read(sp);
   core.mem_write(sp, l);
   l = temp;
   temp = core.mem_read((sp + 1) & 0xffff);
   core.mem_write((sp + 1) & 0xffff, h);
   h = temp;
};
// 0xe4 : CALL PO, nn
instructions[0xe4] = function()
{
   do_conditional_call(!flags.P);
};
// 0xe5 : PUSH HL
instructions[0xe5] = function()
{
   push_word(l | (h << 8));
};
// 0xe6 : AND n
instructions[0xe6] = function()
{
   pc = (pc + 1) & 0xffff;
   do_and(core.mem_read(pc));
};
// 0xe7 : RST 20h
instructions[0xe7] = function()
{
   do_reset(0x20);
};
// 0xe8 : RET PE
instructions[0xe8] = function()
{
   do_conditional_return(!!flags.P);
};
// 0xe9 : JP (HL)
instructions[0xe9] = function()
{
   pc = l | (h << 8);
   pc = (pc - 1) & 0xffff;
};
// 0xea : JP PE, nn
instructions[0xea] = function()
{
   do_conditional_absolute_jump(!!flags.P);
};
// 0xeb : EX DE, HL
instructions[0xeb] = function()
{
   var temp = d;
   d = h;
   h = temp;
   temp = e;
   e = l;
   l = temp;
};
// 0xec : CALL PE, nn
instructions[0xec] = function()
{
   do_conditional_call(!!flags.P);
};
// 0xed : ED Prefix
instructions[0xed] = function()
{
   // R is incremented at the start of the second instruction cycle,
   //  before the instruction actually runs.
   // The high bit of R is not affected by this increment,
   //  it can only be changed using the LD R, A instruction.
   r = (r & 0x80) | (((r & 0x7f) + 1) & 0x7f);

   pc = (pc + 1) & 0xffff;
   var opcode = core.mem_read(pc),
       func = ed_instructions[opcode];
       
   if (func)
   {
      //func = func.bind(this);
      func();
      cycle_counter += cycle_counts_ed[opcode];
   }
   else
   {
      // If the opcode didn't exist, the whole thing is a two-byte NOP.
      cycle_counter += cycle_counts[0];
   }
};
// 0xee : XOR n
instructions[0xee] = function()
{
   pc = (pc + 1) & 0xffff;
   do_xor(core.mem_read(pc));
};
// 0xef : RST 28h
instructions[0xef] = function()
{
   do_reset(0x28);
};
// 0xf0 : RET P
instructions[0xf0] = function()
{
   do_conditional_return(!flags.S);
};
// 0xf1 : POP AF
instructions[0xf1] = function()
{
   var result = pop_word();
   set_flags_register(result & 0xff);
   a = (result & 0xff00) >>> 8;
};
// 0xf2 : JP P, nn
instructions[0xf2] = function()
{
   do_conditional_absolute_jump(!flags.S);
};
// 0xf3 : DI
instructions[0xf3] = function()
{
   // DI doesn't actually take effect until after the next instruction.
   do_delayed_di = true;
};
// 0xf4 : CALL P, nn
instructions[0xf4] = function()
{
   do_conditional_call(!flags.S);
};
// 0xf5 : PUSH AF
instructions[0xf5] = function()
{
   push_word(get_flags_register() | (a << 8));
};
// 0xf6 : OR n
instructions[0xf6] = function()
{
   pc = (pc + 1) & 0xffff;
   do_or(core.mem_read(pc));
};
// 0xf7 : RST 30h
instructions[0xf7] = function()
{
   do_reset(0x30);
};
// 0xf8 : RET M
instructions[0xf8] = function()
{
   do_conditional_return(!!flags.S);
};
// 0xf9 : LD SP, HL
instructions[0xf9] = function()
{
   sp = l | (h << 8);
};
// 0xfa : JP M, nn
instructions[0xfa] = function()
{
   do_conditional_absolute_jump(!!flags.S);
};
// 0xfb : EI
instructions[0xfb] = function()
{
   // EI doesn't actually take effect until after the next instruction.
   do_delayed_ei = true;
};
// 0xfc : CALL M, nn
instructions[0xfc] = function()
{
   do_conditional_call(!!flags.S);
};
// 0xfd : FD Prefix (IY instructions)
instructions[0xfd] = function()
{
   // R is incremented at the start of the second instruction cycle,
   //  before the instruction actually runs.
   // The high bit of R is not affected by this increment,
   //  it can only be changed using the LD R, A instruction.
   r = (r & 0x80) | (((r & 0x7f) + 1) & 0x7f);
   
   pc = (pc + 1) & 0xffff;
   var opcode = core.mem_read(pc),
       func = dd_instructions[opcode];
       
   if (func)
   {
      // Rather than copy and paste all the IX instructions into IY instructions,
      //  what we'll do is sneakily copy IY into IX, run the IX instruction,
      //  and then copy the result into IY and restore the old IX.
      var temp = ix;
      ix = iy;
      //func = func.bind(this);
      func();
      iy = ix;
      ix = temp;
      
      cycle_counter += cycle_counts_dd[opcode];
   }
   else
   {
      // Apparently if an FD opcode doesn't exist,
      //  it gets treated as an unprefixed opcode.
      // What we'll do to handle that is just back up the 
      //  program counter, so that this byte gets decoded
      //  as a normal instruction.
      pc = (pc - 1) & 0xffff;
      // And we'll add in the cycle count for a NOP.
      cycle_counter += cycle_counts[0];
   }
};
// 0xfe : CP n
instructions[0xfe] = function()
{
   pc = (pc + 1) & 0xffff;
   do_cp(core.mem_read(pc));
};
// 0xff : RST 38h
instructions[0xff] = function()
{
   do_reset(0x38);
};


///////////////////////////////////////////////////////////////////////////////
/// This table of ED opcodes is pretty sparse;
///  there are not very many valid ED-prefixed opcodes in the Z80,
///  and many of the ones that are valid are not documented.
///////////////////////////////////////////////////////////////////////////////
let ed_instructions = [];
// 0x40 : IN B, (C)
ed_instructions[0x40] = function()
{
   b = do_in((b << 8) | c);
};
// 0x41 : OUT (C), B
ed_instructions[0x41] = function()
{
   core.io_write((b << 8) | c, b);
};
// 0x42 : SBC HL, BC
ed_instructions[0x42] = function()
{
   do_hl_sbc(c | (b << 8));
};
// 0x43 : LD (nn), BC
ed_instructions[0x43] = function()
{
   pc = (pc + 1) & 0xffff;
   var address = core.mem_read(pc);
   pc = (pc + 1) & 0xffff;
   address |= core.mem_read(pc) << 8;
   
   core.mem_write(address, c);
   core.mem_write((address + 1) & 0xffff, b);
};
// 0x44 : NEG
ed_instructions[0x44] = function()
{
   do_neg();
};
// 0x45 : RETN
ed_instructions[0x45] = function()
{
   pc = (pop_word() - 1) & 0xffff;
   iff1 = iff2;
};
// 0x46 : IM 0
ed_instructions[0x46] = function()
{
   imode = 0;
};
// 0x47 : LD I, A
ed_instructions[0x47] = function()
{
   i = a
};
// 0x48 : IN C, (C)
ed_instructions[0x48] = function()
{
   c = do_in((b << 8) | c);
};
// 0x49 : OUT (C), C
ed_instructions[0x49] = function()
{
   core.io_write((b << 8) | c, c);
};
// 0x4a : ADC HL, BC
ed_instructions[0x4a] = function()
{
   do_hl_adc(c | (b << 8));
};
// 0x4b : LD BC, (nn)
ed_instructions[0x4b] = function()
{
   pc = (pc + 1) & 0xffff;
   var address = core.mem_read(pc);
   pc = (pc + 1) & 0xffff;
   address |= core.mem_read(pc) << 8;
   
   c = core.mem_read(address);
   b = core.mem_read((address + 1) & 0xffff);
};
// 0x4c : NEG (Undocumented)
ed_instructions[0x4c] = function()
{
   do_neg();
};
// 0x4d : RETI
ed_instructions[0x4d] = function()
{
   pc = (pop_word() - 1) & 0xffff;
};
// 0x4e : IM 0 (Undocumented)
ed_instructions[0x4e] = function()
{
   imode = 0;
};
// 0x4f : LD R, A
ed_instructions[0x4f] = function()
{
   r = a;
};
// 0x50 : IN D, (C)
ed_instructions[0x50] = function()
{
   d = do_in((b << 8) | c);
};
// 0x51 : OUT (C), D
ed_instructions[0x51] = function()
{
   core.io_write((b << 8) | c, d);
};
// 0x52 : SBC HL, DE
ed_instructions[0x52] = function()
{
   do_hl_sbc(e | (d << 8));
};
// 0x53 : LD (nn), DE
ed_instructions[0x53] = function()
{
   pc = (pc + 1) & 0xffff;
   var address = core.mem_read(pc);
   pc = (pc + 1) & 0xffff;
   address |= core.mem_read(pc) << 8;
   
   core.mem_write(address, e);
   core.mem_write((address + 1) & 0xffff, d);
};
// 0x54 : NEG (Undocumented)
ed_instructions[0x54] = function()
{
   do_neg();
};
// 0x55 : RETN
ed_instructions[0x55] = function()
{
   pc = (pop_word() - 1) & 0xffff;
   iff1 = iff2;
};
// 0x56 : IM 1
ed_instructions[0x56] = function()
{
   imode = 1;
};
// 0x57 : LD A, I
ed_instructions[0x57] = function()
{
   a = i;
   flags.S = a & 0x80 ? 1 : 0;
   flags.Z = a ? 0 : 1;
   flags.H = 0;
   flags.P = iff2;
   flags.N = 0;
   update_xy_flags(a);
};
// 0x58 : IN E, (C)
ed_instructions[0x58] = function()
{
   e = do_in((b << 8) | c);
};
// 0x59 : OUT (C), E
ed_instructions[0x59] = function()
{
   core.io_write((b << 8) | c, e);
};
// 0x5a : ADC HL, DE
ed_instructions[0x5a] = function()
{
   do_hl_adc(e | (d << 8));
};
// 0x5b : LD DE, (nn)
ed_instructions[0x5b] = function()
{
   pc = (pc + 1) & 0xffff;
   var address = core.mem_read(pc);
   pc = (pc + 1) & 0xffff;
   address |= core.mem_read(pc) << 8;
   
   e = core.mem_read(address);
   d = core.mem_read((address + 1) & 0xffff);
};
// 0x5c : NEG (Undocumented)
ed_instructions[0x5c] = function()
{
   do_neg();
};
// 0x5d : RETN
ed_instructions[0x5d] = function()
{
   pc = (pop_word() - 1) & 0xffff;
   iff1 = iff2;
};
// 0x5e : IM 2
ed_instructions[0x5e] = function()
{
   imode = 2;
};
// 0x5f : LD A, R
ed_instructions[0x5f] = function()
{
   a = r;
   flags.S = a & 0x80 ? 1 : 0;
   flags.Z = a ? 0 : 1;
   flags.H = 0;
   flags.P = iff2;
   flags.N = 0;
   update_xy_flags(a);
};
// 0x60 : IN H, (C)
ed_instructions[0x60] = function()
{
   h = do_in((b << 8) | c);
};
// 0x61 : OUT (C), H
ed_instructions[0x61] = function()
{
   core.io_write((b << 8) | c, h);
};
// 0x62 : SBC HL, HL
ed_instructions[0x62] = function()
{
   do_hl_sbc(l | (h << 8));
};
// 0x63 : LD (nn), HL (Undocumented)
ed_instructions[0x63] = function()
{
   pc = (pc + 1) & 0xffff;
   var address = core.mem_read(pc);
   pc = (pc + 1) & 0xffff;
   address |= core.mem_read(pc) << 8;
   
   core.mem_write(address, l);
   core.mem_write((address + 1) & 0xffff, h);
};
// 0x64 : NEG (Undocumented)
ed_instructions[0x64] = function()
{
   do_neg();
};
// 0x65 : RETN
ed_instructions[0x65] = function()
{
   pc = (pop_word() - 1) & 0xffff;
   iff1 = iff2;
};
// 0x66 : IM 0
ed_instructions[0x66] = function()
{
   imode = 0;
};
// 0x67 : RRD
ed_instructions[0x67] = function()
{
   var hl_value = core.mem_read(l | (h << 8));
   var temp1 = hl_value & 0x0f, temp2 = a & 0x0f;
   hl_value = ((hl_value & 0xf0) >>> 4) | (temp2 << 4);
   a = (a & 0xf0) | temp1;
   core.mem_write(l | (h << 8), hl_value);
   
   flags.S = (a & 0x80) ? 1 : 0;
   flags.Z = a ? 0 : 1;
   flags.H = 0;
   flags.P = get_parity(a) ? 1 : 0;
   flags.N = 0;
   update_xy_flags(a);
};
// 0x68 : IN L, (C)
ed_instructions[0x68] = function()
{
   l = do_in((b << 8) | c);
};
// 0x69 : OUT (C), L
ed_instructions[0x69] = function()
{
   core.io_write((b << 8) | c, l);
};
// 0x6a : ADC HL, HL
ed_instructions[0x6a] = function()
{
   do_hl_adc(l | (h << 8));
};
// 0x6b : LD HL, (nn) (Undocumented)
ed_instructions[0x6b] = function()
{
   pc = (pc + 1) & 0xffff;
   var address = core.mem_read(pc);
   pc = (pc + 1) & 0xffff;
   address |= core.mem_read(pc) << 8;
   
   l = core.mem_read(address);
   h = core.mem_read((address + 1) & 0xffff);
};
// 0x6c : NEG (Undocumented)
ed_instructions[0x6c] = function()
{
   do_neg();
};
// 0x6d : RETN
ed_instructions[0x6d] = function()
{
   pc = (pop_word() - 1) & 0xffff;
   iff1 = iff2;
};
// 0x6e : IM 0 (Undocumented)
ed_instructions[0x6e] = function()
{
   imode = 0;
};
// 0x6f : RLD
ed_instructions[0x6f] = function()
{
   var hl_value = core.mem_read(l | (h << 8));
   var temp1 = hl_value & 0xf0, temp2 = a & 0x0f;
   hl_value = ((hl_value & 0x0f) << 4) | temp2;
   a = (a & 0xf0) | (temp1 >>> 4);
   core.mem_write(l | (h << 8), hl_value);
   
   flags.S = (a & 0x80) ? 1 : 0;
   flags.Z = a ? 0 : 1;
   flags.H = 0;
   flags.P = get_parity(a) ? 1 : 0;
   flags.N = 0;
   update_xy_flags(a);
};
// 0x70 : IN (C) (Undocumented)
ed_instructions[0x70] = function()
{
   do_in((b << 8) | c);
};
// 0x71 : OUT (C), 0 (Undocumented)
ed_instructions[0x71] = function()
{
   core.io_write((b << 8) | c, 0);
};
// 0x72 : SBC HL, SP
ed_instructions[0x72] = function()
{
   do_hl_sbc(sp);
};
// 0x73 : LD (nn), SP
ed_instructions[0x73] = function()
{
   pc = (pc + 1) & 0xffff;
   var address = core.mem_read(pc);
   pc = (pc + 1) & 0xffff;
   address |= core.mem_read(pc) << 8;
   
   core.mem_write(address, sp & 0xff);
   core.mem_write((address + 1) & 0xffff, (sp >>> 8) & 0xff);
};
// 0x74 : NEG (Undocumented)
ed_instructions[0x74] = function()
{
   do_neg();
};
// 0x75 : RETN
ed_instructions[0x75] = function()
{
   pc = (pop_word() - 1) & 0xffff;
   iff1 = iff2;
};
// 0x76 : IM 1
ed_instructions[0x76] = function()
{
   imode = 1;
};
// 0x78 : IN A, (C)
ed_instructions[0x78] = function()
{
   a = do_in((b << 8) | c);
};
// 0x79 : OUT (C), A
ed_instructions[0x79] = function()
{
   core.io_write((b << 8) | c, a);
};
// 0x7a : ADC HL, SP
ed_instructions[0x7a] = function()
{
   do_hl_adc(sp);
};
// 0x7b : LD SP, (nn)
ed_instructions[0x7b] = function()
{
   pc = (pc + 1) & 0xffff;
   var address = core.mem_read(pc);
   pc = (pc + 1) & 0xffff;
   address |= core.mem_read(pc) << 8;
   
   sp = core.mem_read(address);
   sp |= core.mem_read((address + 1) & 0xffff) << 8;
};
// 0x7c : NEG (Undocumented)
ed_instructions[0x7c] = function()
{
   do_neg();
};
// 0x7d : RETN
ed_instructions[0x7d] = function()
{
   pc = (pop_word() - 1) & 0xffff;
   iff1 = iff2;
};
// 0x7e : IM 2
ed_instructions[0x7e] = function()
{
   imode = 2;
};
// 0xa0 : LDI
ed_instructions[0xa0] = function()
{
   do_ldi();
};
// 0xa1 : CPI
ed_instructions[0xa1] = function()
{
   do_cpi();
};
// 0xa2 : INI
ed_instructions[0xa2] = function()
{
   do_ini();
};
// 0xa3 : OUTI
ed_instructions[0xa3] = function()
{
   do_outi();
};
// 0xa8 : LDD
ed_instructions[0xa8] = function()
{
   do_ldd();
};
// 0xa9 : CPD
ed_instructions[0xa9] = function()
{
   do_cpd();
};
// 0xaa : IND
ed_instructions[0xaa] = function()
{
   do_ind();
};
// 0xab : OUTD
ed_instructions[0xab] = function()
{
   do_outd();
};
// 0xb0 : LDIR
ed_instructions[0xb0] = function()
{
   do_ldi();
   if (b || c)
   {
      cycle_counter += 5;
      pc = (pc - 2) & 0xffff;
   }
};
// 0xb1 : CPIR
ed_instructions[0xb1] = function()
{
   do_cpi();
   if (!flags.Z && (b || c))
   {
      cycle_counter += 5;
      pc = (pc - 2) & 0xffff;
   }
};
// 0xb2 : INIR
ed_instructions[0xb2] = function()
{
   do_ini();
   if (b)
   {
      cycle_counter += 5;
      pc = (pc - 2) & 0xffff;
   }
};
// 0xb3 : OTIR
ed_instructions[0xb3] = function()
{
   do_outi();
   if (b)
   {
      cycle_counter += 5;
      pc = (pc - 2) & 0xffff;
   }
};
// 0xb8 : LDDR
ed_instructions[0xb8] = function()
{
   do_ldd();
   if (b || c)
   {
      cycle_counter += 5;
      pc = (pc - 2) & 0xffff;
   }
};
// 0xb9 : CPDR
ed_instructions[0xb9] = function()
{
   do_cpd();
   if (!flags.Z && (b || c))
   {
      cycle_counter += 5;
      pc = (pc - 2) & 0xffff;
   }
};
// 0xba : INDR
ed_instructions[0xba] = function()
{
   do_ind();
   if (b)
   {
      cycle_counter += 5;
      pc = (pc - 2) & 0xffff;
   }
};
// 0xbb : OTDR
ed_instructions[0xbb] = function()
{
   do_outd();
   if (b)
   {
      cycle_counter += 5;
      pc = (pc - 2) & 0xffff;
   }
};


///////////////////////////////////////////////////////////////////////////////
/// Like ED, this table is quite sparse,
///  and many of the opcodes here are also undocumented.
/// The undocumented instructions here are those that deal with only one byte
///  of the two-byte IX register; the bytes are designed IXH and IXL here.
///////////////////////////////////////////////////////////////////////////////
let dd_instructions = [];
// 0x09 : ADD IX, BC
dd_instructions[0x09] = function()
{
   do_ix_add(c | (b << 8));
};
// 0x19 : ADD IX, DE
dd_instructions[0x19] = function()
{
   do_ix_add(e | (d << 8));
};
// 0x21 : LD IX, nn
dd_instructions[0x21] = function()
{
   pc = (pc + 1) & 0xffff;
   ix = core.mem_read(pc);
   pc = (pc + 1) & 0xffff;
   ix |= (core.mem_read(pc) << 8);
};
// 0x22 : LD (nn), IX
dd_instructions[0x22] = function()
{
   pc = (pc + 1) & 0xffff;
   var address = core.mem_read(pc);
   pc = (pc + 1) & 0xffff;
   address |= (core.mem_read(pc) << 8);
   
   core.mem_write(address, ix & 0xff);
   core.mem_write((address + 1) & 0xffff, (ix >>> 8) & 0xff);
};
// 0x23 : INC IX
dd_instructions[0x23] = function()
{
   ix = (ix + 1) & 0xffff;
};
// 0x24 : INC IXH (Undocumented)
dd_instructions[0x24] = function()
{
   ix = (do_inc(ix >>> 8) << 8) | (ix & 0xff);
};
// 0x25 : DEC IXH (Undocumented)
dd_instructions[0x25] = function()
{
   ix = (do_dec(ix >>> 8) << 8) | (ix & 0xff);
};
// 0x26 : LD IXH, n (Undocumented)
dd_instructions[0x26] = function()
{
   pc = (pc + 1) & 0xffff;
   ix = (core.mem_read(pc) << 8) | (ix & 0xff);
};
// 0x29 : ADD IX, IX
dd_instructions[0x29] = function()
{
   do_ix_add(ix);
};
// 0x2a : LD IX, (nn)
dd_instructions[0x2a] = function()
{
   pc = (pc + 1) & 0xffff;
   var address = core.mem_read(pc);
   pc = (pc + 1) & 0xffff;
   address |= (core.mem_read(pc) << 8);
   
   ix = core.mem_read(address);
   ix |= (core.mem_read((address + 1) & 0xffff) << 8);
};
// 0x2b : DEC IX
dd_instructions[0x2b] = function()
{
   ix = (ix - 1) & 0xffff;
};
// 0x2c : INC IXL (Undocumented)
dd_instructions[0x2c] = function()
{
   ix = do_inc(ix & 0xff) | (ix & 0xff00);
};
// 0x2d : DEC IXL (Undocumented)
dd_instructions[0x2d] = function()
{
   ix = do_dec(ix & 0xff) | (ix & 0xff00);
};
// 0x2e : LD IXL, n (Undocumented)
dd_instructions[0x2e] = function()
{
   pc = (pc + 1) & 0xffff;
   ix = (core.mem_read(pc) & 0xff) | (ix & 0xff00);
};
// 0x34 : INC (IX+n)
dd_instructions[0x34] = function()
{
   pc = (pc + 1) & 0xffff;
   var offset = get_signed_offset_byte(core.mem_read(pc)),
       value = core.mem_read((offset + ix) & 0xffff);
   core.mem_write((offset + ix) & 0xffff, do_inc(value));
};
// 0x35 : DEC (IX+n)
dd_instructions[0x35] = function()
{
   pc = (pc + 1) & 0xffff;
   var offset = get_signed_offset_byte(core.mem_read(pc)),
       value = core.mem_read((offset + ix) & 0xffff);
   core.mem_write((offset + ix) & 0xffff, do_dec(value));
};
// 0x36 : LD (IX+n), n
dd_instructions[0x36] = function()
{
   pc = (pc + 1) & 0xffff;
   var offset = get_signed_offset_byte(core.mem_read(pc));
   pc = (pc + 1) & 0xffff;
   core.mem_write((ix + offset) & 0xffff, core.mem_read(pc));   
};
// 0x39 : ADD IX, SP
dd_instructions[0x39] = function()
{
   do_ix_add(sp);
};
// 0x44 : LD B, IXH (Undocumented)
dd_instructions[0x44] = function()
{
   b = (ix >>> 8) & 0xff;
};
// 0x45 : LD B, IXL (Undocumented)
dd_instructions[0x45] = function()
{
   b = ix & 0xff;
};
// 0x46 : LD B, (IX+n)
dd_instructions[0x46] = function()
{
   pc = (pc + 1) & 0xffff;
   var offset = get_signed_offset_byte(core.mem_read(pc));
   b = core.mem_read((ix + offset) & 0xffff);
};
// 0x4c : LD C, IXH (Undocumented)
dd_instructions[0x4c] = function()
{
   c = (ix >>> 8) & 0xff;
};
// 0x4d : LD C, IXL (Undocumented)
dd_instructions[0x4d] = function()
{
   c = ix & 0xff;
};
// 0x4e : LD C, (IX+n)
dd_instructions[0x4e] = function()
{
   pc = (pc + 1) & 0xffff;
   var offset = get_signed_offset_byte(core.mem_read(pc));
   c = core.mem_read((ix + offset) & 0xffff);
};
// 0x54 : LD D, IXH (Undocumented)
dd_instructions[0x54] = function()
{
   d = (ix >>> 8) & 0xff;
};
// 0x55 : LD D, IXL (Undocumented)
dd_instructions[0x55] = function()
{
   d = ix & 0xff;
};
// 0x56 : LD D, (IX+n)
dd_instructions[0x56] = function()
{
   pc = (pc + 1) & 0xffff;
   var offset = get_signed_offset_byte(core.mem_read(pc));
   d = core.mem_read((ix + offset) & 0xffff);
};
// 0x5c : LD E, IXH (Undocumented)
dd_instructions[0x5c] = function()
{
   e = (ix >>> 8) & 0xff;
};
// 0x5d : LD E, IXL (Undocumented)
dd_instructions[0x5d] = function()
{
   e = ix & 0xff;
};
// 0x5e : LD E, (IX+n)
dd_instructions[0x5e] = function()
{
   pc = (pc + 1) & 0xffff;
   var offset = get_signed_offset_byte(core.mem_read(pc));
   e = core.mem_read((ix + offset) & 0xffff);
};
// 0x60 : LD IXH, B (Undocumented)
dd_instructions[0x60] = function()
{
   ix = (ix & 0xff) | (b << 8);
};
// 0x61 : LD IXH, C (Undocumented)
dd_instructions[0x61] = function()
{
   ix = (ix & 0xff) | (c << 8);
};
// 0x62 : LD IXH, D (Undocumented)
dd_instructions[0x62] = function()
{
   ix = (ix & 0xff) | (d << 8);
};
// 0x63 : LD IXH, E (Undocumented)
dd_instructions[0x63] = function()
{
   ix = (ix & 0xff) | (e << 8);
};
// 0x64 : LD IXH, IXH (Undocumented)
dd_instructions[0x64] = function()
{
   // No-op.
};
// 0x65 : LD IXH, IXL (Undocumented)
dd_instructions[0x65] = function()
{
   ix = (ix & 0xff) | ((ix & 0xff) << 8);
};
// 0x66 : LD H, (IX+n)
dd_instructions[0x66] = function()
{
   pc = (pc + 1) & 0xffff;
   var offset = get_signed_offset_byte(core.mem_read(pc));
   h = core.mem_read((ix + offset) & 0xffff);
};
// 0x67 : LD IXH, A (Undocumented)
dd_instructions[0x67] = function()
{
   ix = (ix & 0xff) | (a << 8);
};
// 0x68 : LD IXL, B (Undocumented)
dd_instructions[0x68] = function()
{
   ix = (ix & 0xff00) | b;
};
// 0x69 : LD IXL, C (Undocumented)
dd_instructions[0x69] = function()
{
   ix = (ix & 0xff00) | c;
};
// 0x6a : LD IXL, D (Undocumented)
dd_instructions[0x6a] = function()
{
   ix = (ix & 0xff00) | d;
};
// 0x6b : LD IXL, E (Undocumented)
dd_instructions[0x6b] = function()
{
   ix = (ix & 0xff00) | e;
};
// 0x6c : LD IXL, IXH (Undocumented)
dd_instructions[0x6c] = function()
{
   ix = (ix & 0xff00) | (ix >>> 8);
};
// 0x6d : LD IXL, IXL (Undocumented)
dd_instructions[0x6d] = function()
{
   // No-op.
};
// 0x6e : LD L, (IX+n)
dd_instructions[0x6e] = function()
{
   pc = (pc + 1) & 0xffff;
   var offset = get_signed_offset_byte(core.mem_read(pc));
   l = core.mem_read((ix + offset) & 0xffff);
};
// 0x6f : LD IXL, A (Undocumented)
dd_instructions[0x6f] = function()
{
   ix = (ix & 0xff00) | a;
};
// 0x70 : LD (IX+n), B
dd_instructions[0x70] = function()
{
   pc = (pc + 1) & 0xffff;
   var offset = get_signed_offset_byte(core.mem_read(pc));
   core.mem_write((ix + offset) & 0xffff, b);
};
// 0x71 : LD (IX+n), C
dd_instructions[0x71] = function()
{
   pc = (pc + 1) & 0xffff;
   var offset = get_signed_offset_byte(core.mem_read(pc));
   core.mem_write((ix + offset) & 0xffff, c);
};
// 0x72 : LD (IX+n), D
dd_instructions[0x72] = function()
{
   pc = (pc + 1) & 0xffff;
   var offset = get_signed_offset_byte(core.mem_read(pc));
   core.mem_write((ix + offset) & 0xffff, d);
};
// 0x73 : LD (IX+n), E
dd_instructions[0x73] = function()
{
   pc = (pc + 1) & 0xffff;
   var offset = get_signed_offset_byte(core.mem_read(pc));
   core.mem_write((ix + offset) & 0xffff, e);
};
// 0x74 : LD (IX+n), H
dd_instructions[0x74] = function()
{
   pc = (pc + 1) & 0xffff;
   var offset = get_signed_offset_byte(core.mem_read(pc));
   core.mem_write((ix + offset) & 0xffff, h);
};
// 0x75 : LD (IX+n), L
dd_instructions[0x75] = function()
{
   pc = (pc + 1) & 0xffff;
   var offset = get_signed_offset_byte(core.mem_read(pc));
   core.mem_write((ix + offset) & 0xffff, l);
};
// 0x77 : LD (IX+n), A
dd_instructions[0x77] = function()
{
   pc = (pc + 1) & 0xffff;
   var offset = get_signed_offset_byte(core.mem_read(pc));
   core.mem_write((ix + offset) & 0xffff, a);
};
// 0x7c : LD A, IXH (Undocumented)
dd_instructions[0x7c] = function()
{
   a = (ix >>> 8) & 0xff;
};
// 0x7d : LD A, IXL (Undocumented)
dd_instructions[0x7d] = function()
{
   a = ix & 0xff;
};
// 0x7e : LD A, (IX+n)
dd_instructions[0x7e] = function()
{
   pc = (pc + 1) & 0xffff;
   var offset = get_signed_offset_byte(core.mem_read(pc));
   a = core.mem_read((ix + offset) & 0xffff);
};
// 0x84 : ADD A, IXH (Undocumented)
dd_instructions[0x84] = function()
{
   do_add((ix >>> 8) & 0xff);
};
// 0x85 : ADD A, IXL (Undocumented)
dd_instructions[0x85] = function()
{
   do_add(ix & 0xff);
};
// 0x86 : ADD A, (IX+n)
dd_instructions[0x86] = function()
{
   pc = (pc + 1) & 0xffff;
   var offset = get_signed_offset_byte(core.mem_read(pc));
   do_add(core.mem_read((ix + offset) & 0xffff));
};
// 0x8c : ADC A, IXH (Undocumented)
dd_instructions[0x8c] = function()
{
   do_adc((ix >>> 8) & 0xff);
};
// 0x8d : ADC A, IXL (Undocumented)
dd_instructions[0x8d] = function()
{
   do_adc(ix & 0xff);
};
// 0x8e : ADC A, (IX+n)
dd_instructions[0x8e] = function()
{
   pc = (pc + 1) & 0xffff;
   var offset = get_signed_offset_byte(core.mem_read(pc));
   do_adc(core.mem_read((ix + offset) & 0xffff));
};
// 0x94 : SUB IXH (Undocumented)
dd_instructions[0x94] = function()
{
   do_sub((ix >>> 8) & 0xff);
};
// 0x95 : SUB IXL (Undocumented)
dd_instructions[0x95] = function()
{
   do_sub(ix & 0xff);
};
// 0x96 : SUB A, (IX+n)
dd_instructions[0x96] = function()
{
   pc = (pc + 1) & 0xffff;
   var offset = get_signed_offset_byte(core.mem_read(pc));
   do_sub(core.mem_read((ix + offset) & 0xffff));
};
// 0x9c : SBC IXH (Undocumented)
dd_instructions[0x9c] = function()
{
   do_sbc((ix >>> 8) & 0xff);
};
// 0x9d : SBC IXL (Undocumented)
dd_instructions[0x9d] = function()
{
   do_sbc(ix & 0xff);
};
// 0x9e : SBC A, (IX+n)
dd_instructions[0x9e] = function()
{
   pc = (pc + 1) & 0xffff;
   var offset = get_signed_offset_byte(core.mem_read(pc));
   do_sbc(core.mem_read((ix + offset) & 0xffff));
};
// 0xa4 : AND IXH (Undocumented)
dd_instructions[0xa4] = function()
{
   do_and((ix >>> 8) & 0xff);
};
// 0xa5 : AND IXL (Undocumented)
dd_instructions[0xa5] = function()
{
   do_and(ix & 0xff);
};
// 0xa6 : AND A, (IX+n)
dd_instructions[0xa6] = function()
{
   pc = (pc + 1) & 0xffff;
   var offset = get_signed_offset_byte(core.mem_read(pc));
   do_and(core.mem_read((ix + offset) & 0xffff));
};
// 0xac : XOR IXH (Undocumented)
dd_instructions[0xac] = function()
{
   do_xor((ix >>> 8) & 0xff);
};
// 0xad : XOR IXL (Undocumented)
dd_instructions[0xad] = function()
{
   do_xor(ix & 0xff);
};
// 0xae : XOR A, (IX+n)
dd_instructions[0xae] = function()
{
   pc = (pc + 1) & 0xffff;
   var offset = get_signed_offset_byte(core.mem_read(pc));
   do_xor(core.mem_read((ix + offset) & 0xffff));
};
// 0xb4 : OR IXH (Undocumented)
dd_instructions[0xb4] = function()
{
   do_or((ix >>> 8) & 0xff);
};
// 0xb5 : OR IXL (Undocumented)
dd_instructions[0xb5] = function()
{
   do_or(ix & 0xff);
};
// 0xb6 : OR A, (IX+n)
dd_instructions[0xb6] = function()
{
   pc = (pc + 1) & 0xffff;
   var offset = get_signed_offset_byte(core.mem_read(pc));
   do_or(core.mem_read((ix + offset) & 0xffff));
};
// 0xbc : CP IXH (Undocumented)
dd_instructions[0xbc] = function()
{
   do_cp((ix >>> 8) & 0xff);
};
// 0xbd : CP IXL (Undocumented)
dd_instructions[0xbd] = function()
{
   do_cp(ix & 0xff);
};
// 0xbe : CP A, (IX+n)
dd_instructions[0xbe] = function()
{
   pc = (pc + 1) & 0xffff;
   var offset = get_signed_offset_byte(core.mem_read(pc));
   do_cp(core.mem_read((ix + offset) & 0xffff));
};
// 0xcb : CB Prefix (IX bit instructions)
dd_instructions[0xcb] = function()
{
   pc = (pc + 1) & 0xffff;
   var offset = get_signed_offset_byte(core.mem_read(pc));
   pc = (pc + 1) & 0xffff;
   var opcode = core.mem_read(pc), value;
   
   // As with the "normal" CB prefix, we implement the DDCB prefix
   //  by decoding the opcode directly, rather than using a table.
   if (opcode < 0x40)
   {
      // Shift and rotate instructions.
      var ddcb_functions = [do_rlc, do_rrc, do_rl, do_rr,
                            do_sla, do_sra, do_sll, do_srl];
      
      // Most of the opcodes in this range are not valid,
      //  so we map this opcode onto one of the ones that is.
      var func = ddcb_functions[(opcode & 0x38) >>> 3],
      value = func( core.mem_read((ix + offset) & 0xffff));
      
      core.mem_write((ix + offset) & 0xffff, value);
   }
   else
   {
      var bit_number = (opcode & 0x38) >>> 3;
      
      if (opcode < 0x80)
      {
         // BIT
         flags.N = 0;
         flags.H = 1;
         flags.Z = !(core.mem_read((ix + offset) & 0xffff) & (1 << bit_number)) ? 1 : 0;
         flags.P = flags.Z;
         flags.S = ((bit_number === 7) && !flags.Z) ? 1 : 0;
      }
      else if (opcode < 0xc0)
      {
         // RES
         value = core.mem_read((ix + offset) & 0xffff) & ~(1 << bit_number) & 0xff;
         core.mem_write((ix + offset) & 0xffff, value);
      }
      else
      {
         // SET
         value = core.mem_read((ix + offset) & 0xffff) | (1 << bit_number);
         core.mem_write((ix + offset) & 0xffff, value);
      }
   }
   
   // This implements the undocumented shift, RES, and SET opcodes,
   //  which write their result to memory and also to an 8080 register.
   if (value !== undefined)
   {
      if ((opcode & 0x07) === 0)
         b = value;
      else if ((opcode & 0x07) === 1)
         c = value;
      else if ((opcode & 0x07) === 2)
         d = value;
      else if ((opcode & 0x07) === 3)
         e = value;
      else if ((opcode & 0x07) === 4)
         h = value;
      else if ((opcode & 0x07) === 5)
         l = value;
      // 6 is the documented opcode, which doesn't set a register.
      else if ((opcode & 0x07) === 7)
         a = value;
   }
   
   cycle_counter += cycle_counts_cb[opcode] + 8;
};
// 0xe1 : POP IX
dd_instructions[0xe1] = function()
{
   ix = pop_word();
};
// 0xe3 : EX (SP), IX
dd_instructions[0xe3] = function()
{
   var temp = ix;
   ix = core.mem_read(sp);
   ix |= core.mem_read((sp + 1) & 0xffff) << 8;
   core.mem_write(sp, temp & 0xff);
   core.mem_write((sp + 1) & 0xffff, (temp >>> 8) & 0xff);
};
// 0xe5 : PUSH IX
dd_instructions[0xe5] = function()
{
   push_word(ix);
};
// 0xe9 : JP (IX)
dd_instructions[0xe9] = function()
{
   pc = (ix - 1) & 0xffff;
};
// 0xf9 : LD SP, IX
dd_instructions[0xf9] = function()
{
   sp = ix;
};


///////////////////////////////////////////////////////////////////////////////
/// These tables contain the number of T cycles used for each instruction.
/// In a few special cases, such as conditional control flow instructions,
///  additional cycles might be added to these values.
/// The total number of cycles is the return value of run_instruction().
///////////////////////////////////////////////////////////////////////////////
let cycle_counts = [
    4, 10,  7,  6,  4,  4,  7,  4,  4, 11,  7,  6,  4,  4,  7,  4,
    8, 10,  7,  6,  4,  4,  7,  4, 12, 11,  7,  6,  4,  4,  7,  4,
    7, 10, 16,  6,  4,  4,  7,  4,  7, 11, 16,  6,  4,  4,  7,  4,
    7, 10, 13,  6, 11, 11, 10,  4,  7, 11, 13,  6,  4,  4,  7,  4,
    4,  4,  4,  4,  4,  4,  7,  4,  4,  4,  4,  4,  4,  4,  7,  4,
    4,  4,  4,  4,  4,  4,  7,  4,  4,  4,  4,  4,  4,  4,  7,  4,
    4,  4,  4,  4,  4,  4,  7,  4,  4,  4,  4,  4,  4,  4,  7,  4,
    7,  7,  7,  7,  7,  7,  4,  7,  4,  4,  4,  4,  4,  4,  7,  4,
    4,  4,  4,  4,  4,  4,  7,  4,  4,  4,  4,  4,  4,  4,  7,  4,
    4,  4,  4,  4,  4,  4,  7,  4,  4,  4,  4,  4,  4,  4,  7,  4,
    4,  4,  4,  4,  4,  4,  7,  4,  4,  4,  4,  4,  4,  4,  7,  4,
    4,  4,  4,  4,  4,  4,  7,  4,  4,  4,  4,  4,  4,  4,  7,  4,
    5, 10, 10, 10, 10, 11,  7, 11,  5, 10, 10,  0, 10, 17,  7, 11,
    5, 10, 10, 11, 10, 11,  7, 11,  5,  4, 10, 11, 10,  0,  7, 11,
    5, 10, 10, 19, 10, 11,  7, 11,  5,  4, 10,  4, 10,  0,  7, 11,
    5, 10, 10,  4, 10, 11,  7, 11,  5,  6, 10,  4, 10,  0,  7, 11
];

let cycle_counts_ed = [
    0,  0,  0,  0,  0,  0,  0,  0,  0,  0,  0,  0,  0,  0,  0,  0,
    0,  0,  0,  0,  0,  0,  0,  0,  0,  0,  0,  0,  0,  0,  0,  0,
    0,  0,  0,  0,  0,  0,  0,  0,  0,  0,  0,  0,  0,  0,  0,  0,
    0,  0,  0,  0,  0,  0,  0,  0,  0,  0,  0,  0,  0,  0,  0,  0,
   12, 12, 15, 20,  8, 14,  8,  9, 12, 12, 15, 20,  8, 14,  8,  9,
   12, 12, 15, 20,  8, 14,  8,  9, 12, 12, 15, 20,  8, 14,  8,  9,
   12, 12, 15, 20,  8, 14,  8, 18, 12, 12, 15, 20,  8, 14,  8, 18,
   12, 12, 15, 20,  8, 14,  8,  0, 12, 12, 15, 20,  8, 14,  8,  0,
    0,  0,  0,  0,  0,  0,  0,  0,  0,  0,  0,  0,  0,  0,  0,  0,
    0,  0,  0,  0,  0,  0,  0,  0,  0,  0,  0,  0,  0,  0,  0,  0,
   16, 16, 16, 16,  0,  0,  0,  0, 16, 16, 16, 16,  0,  0,  0,  0,
   16, 16, 16, 16,  0,  0,  0,  0, 16, 16, 16, 16,  0,  0,  0,  0,
    0,  0,  0,  0,  0,  0,  0,  0,  0,  0,  0,  0,  0,  0,  0,  0,
    0,  0,  0,  0,  0,  0,  0,  0,  0,  0,  0,  0,  0,  0,  0,  0,
    0,  0,  0,  0,  0,  0,  0,  0,  0,  0,  0,  0,  0,  0,  0,  0,
    0,  0,  0,  0,  0,  0,  0,  0,  0,  0,  0,  0,  0,  0,  0,  0
];

let cycle_counts_cb = [
    8,  8,  8,  8,  8,  8, 15,  8,  8,  8,  8,  8,  8,  8, 15,  8,
    8,  8,  8,  8,  8,  8, 15,  8,  8,  8,  8,  8,  8,  8, 15,  8,
    8,  8,  8,  8,  8,  8, 15,  8,  8,  8,  8,  8,  8,  8, 15,  8,
    8,  8,  8,  8,  8,  8, 15,  8,  8,  8,  8,  8,  8,  8, 15,  8,
    8,  8,  8,  8,  8,  8, 12,  8,  8,  8,  8,  8,  8,  8, 12,  8,
    8,  8,  8,  8,  8,  8, 12,  8,  8,  8,  8,  8,  8,  8, 12,  8,
    8,  8,  8,  8,  8,  8, 12,  8,  8,  8,  8,  8,  8,  8, 12,  8,
    8,  8,  8,  8,  8,  8, 12,  8,  8,  8,  8,  8,  8,  8, 12,  8,
    8,  8,  8,  8,  8,  8, 15,  8,  8,  8,  8,  8,  8,  8, 15,  8,
    8,  8,  8,  8,  8,  8, 15,  8,  8,  8,  8,  8,  8,  8, 15,  8,
    8,  8,  8,  8,  8,  8, 15,  8,  8,  8,  8,  8,  8,  8, 15,  8,
    8,  8,  8,  8,  8,  8, 15,  8,  8,  8,  8,  8,  8,  8, 15,  8,
    8,  8,  8,  8,  8,  8, 15,  8,  8,  8,  8,  8,  8,  8, 15,  8,
    8,  8,  8,  8,  8,  8, 15,  8,  8,  8,  8,  8,  8,  8, 15,  8,
    8,  8,  8,  8,  8,  8, 15,  8,  8,  8,  8,  8,  8,  8, 15,  8,
    8,  8,  8,  8,  8,  8, 15,  8,  8,  8,  8,  8,  8,  8, 15,  8
];

let cycle_counts_dd = [
    0,  0,  0,  0,  0,  0,  0,  0,  0, 15,  0,  0,  0,  0,  0,  0,
    0,  0,  0,  0,  0,  0,  0,  0,  0, 15,  0,  0,  0,  0,  0,  0,
    0, 14, 20, 10,  8,  8, 11,  0,  0, 15, 20, 10,  8,  8, 11,  0,
    0,  0,  0,  0, 23, 23, 19,  0,  0, 15,  0,  0,  0,  0,  0,  0,
    0,  0,  0,  0,  8,  8, 19,  0,  0,  0,  0,  0,  8,  8, 19,  0,
    0,  0,  0,  0,  8,  8, 19,  0,  0,  0,  0,  0,  8,  8, 19,  0,
    8,  8,  8,  8,  8,  8, 19,  8,  8,  8,  8,  8,  8,  8, 19,  8,
   19, 19, 19, 19, 19, 19,  0, 19,  0,  0,  0,  0,  8,  8, 19,  0,
    0,  0,  0,  0,  8,  8, 19,  0,  0,  0,  0,  0,  8,  8, 19,  0,
    0,  0,  0,  0,  8,  8, 19,  0,  0,  0,  0,  0,  8,  8, 19,  0,
    0,  0,  0,  0,  8,  8, 19,  0,  0,  0,  0,  0,  8,  8, 19,  0,
    0,  0,  0,  0,  8,  8, 19,  0,  0,  0,  0,  0,  8,  8, 19,  0,
    0,  0,  0,  0,  0,  0,  0,  0,  0,  0,  0,  0,  0,  0,  0,  0,
    0,  0,  0,  0,  0,  0,  0,  0,  0,  0,  0,  0,  0,  0,  0,  0,
    0, 14,  0, 23,  0, 15,  0,  0,  0,  8,  0,  0,  0,  0,  0,  0,
    0,  0,  0,  0,  0,  0,  0,  0,  0, 10,  0,  0,  0,  0,  0,  0
];

   // There's tons of stuff in this object,
   //  but only these three functions are the public API.
   return {      
      getState,
      setState,
      reset,
      run_instruction,
      interrupt
   };
}


// Star Blazers / Space Battleship Yamato (Taito 1985) - test machine core
// 68000 = Musashi compiled to WebAssembly; LD-V1000 HLE; video RAM in JS.
function SBYMachine(wasmBytes, prg){
  const S={frame:0};
  const mem={pal:new Uint16Array(0x400), spr:new Uint16Array(0x800), vramA:[new Uint16Array(0x800),new Uint16Array(0x800),new Uint16Array(0x800),new Uint16Array(0x800)], tm1:new Uint16Array(0x800), regs:{}, r440:1, r480:2, r4c0:0, r500:0, r540:0, r580:3};
  Object.defineProperty(mem,'tm0',{get(){ return mem.vramA[mem.r480&3]; }});
  S.mem=mem;
  // inputs: in0 = 600000/1, in2 = 600002/3 (active low), analog 600008/0A/0C/0E (high byte), DIPs 60000B/60000D
  S.inp={in0:0xFFFF,in2:0xFFFF,an:[0x80,0x80,0x80,0x80],dipB:0x00,dipD:0xFF};
  S.sound=[];
  const ld={out:0xFC,cmd:0,frame:0,play:0,speed4:0,acc:0,search:0,dig:[],stack:[]}; S.ld=ld;
  const DIG={0x3F:0,0x0F:1,0x8F:2,0x4F:3,0x2F:4,0xAF:5,0x6F:6,0x1F:7,0x9F:8,0x5F:9};
  const SPD=[0,1,2,4,8,12,16,20];
  function ldRead(){ if(ld.stack.length) return ld.stack.pop(); if(ld.search){ld.search--; if(!ld.search) ld.out=0xD0; else return 0x50;} return ld.out; }
  let lastAcc=-1, lastAccF=-99;
  function ldWrite(v){ ld.cmd=v;
    // Star Blazers sends every command twice (cmd, FF, cmd, FF): the second copy is a repeat, not a new key press
    if(v!=0xFF && v==lastAcc && S.frame-lastAccF<=4){ ld.out&=0x7F; return; }
    if(v!=0xFF && (ld.out&0x80)){ lastAcc=v; lastAccF=S.frame; }
    if(ld.out&0x80){ ld.out&=0x7F;
      if(v in DIG){ ld.dig.push(DIG[v]); if(ld.dig.length>5) ld.dig.shift(); }
      else if(v==0xBF) ld.dig=[];
      else if(v==0xFD){ ld.play=1; ld.speed4=4; ld.out=0x64; }
      else if(v>=0xA0&&v<=0xA7){ ld.speed4=SPD[v-0xA0]; ld.play=1; ld.out=0x2E; }
      else if(v==0xFB||v==0xFE){ ld.play=0; ld.out=0x65; }
      else if(v==0xF7){ let f=0; for(const d of ld.dig) f=f*10+d; ld.frame=f; ld.play=0; ld.search=4; ld.out=0x50; ld.dig=[]; if(S.onSearch) S.onSearch(f); }
      else if(v==0xF9){ ld.play=0; ld.out=0x7C; }
      else if(v==0xC2){ const s=String(ld.frame).padStart(5,'0'); for(let i=4;i>=0;i--) ld.stack.push(s.charCodeAt(i)); }
      else if(v==0xFF) ld.out|=0x80;
    } else { if(v==0xFF) ld.out|=0x80; else ld.out&=0x7F; } }
  function inByte(o){
    const I=S.inp;
    switch(o){ case 0: return I.in0>>8; case 1: return I.in0&255; case 2: return I.in2>>8; case 3: return I.in2&255;
      case 8: return I.an[0]; case 10: return I.an[1]; case 11: return I.dipB; case 12: return I.an[2]; case 13: return I.dipD; case 14: return I.an[3]; }
    return 0xFF; }
  function rd(a,s){
    if(a>=0x400000&&a<0x400800) return mem.pal[(a-0x400000)>>1];
    if(a>=0x800000&&a<0x801000) return mem.spr[(a-0x800000)>>1];
    if(a>=0x840000&&a<0x841000) return mem.tm0[(a-0x840000)>>1];
    if(a>=0x880000&&a<0x881000) return mem.tm1[(a-0x880000)>>1];
    if((a&~1)==0x620000) return ldRead();
    if(a==0x7A0000||a==0x7A0001){ return S.onSoundRead? S.onSoundRead() : 0xFF; }
    if(a>=0x600000&&a<0x600010){ const o=a-0x600000; return s==2?((inByte(o)<<8)|inByte(o+1)):inByte(o); }
    return s==2?0xFFFF:0xFF; }
  function wr(a,v,s){
    if(a>=0x400000&&a<0x400800){ mem.pal[(a-0x400000)>>1]=v; return; }
    if(a>=0x800000&&a<0x801000){ mem.spr[(a-0x800000)>>1]=v; return; }
    if(a>=0x840000&&a<0x841000){ mem.tm0[(a-0x840000)>>1]=v; return; }
    if(a>=0x880000&&a<0x881000){ mem.tm1[(a-0x880000)>>1]=v; return; }
    if((a&~1)==0x720000){ ldWrite(v&0xFF); return; }
    if(a==0x7A0000){ S.sound.push(v); if(S.sound.length>64) S.sound.shift(); if(S.onSound) S.onSound(v&0xFF); return; }
    if(a==0x440000) mem.r440=v; else if(a==0x480000) mem.r480=v; else if(a==0x4C0000) mem.r4c0=v; else if(a==0x500000) mem.r500=v; else if(a==0x540000) mem.r540=v; else if(a==0x580000) mem.r580=v;
    mem.regs[a.toString(16)]=v; }
  const wasi={fd_close:()=>0,fd_seek:()=>0,fd_write:()=>0,proc_exit:()=>{}};
  const inst=new WebAssembly.Instance(new WebAssembly.Module(wasmBytes),{env:{js_read:rd,js_write:wr},wasi_snapshot_preview1:wasi});
  const X=inst.exports; S.X=X;
  new Uint8Array(X.memory.buffer).set(prg,X.rom_ptr());
  X.cpu_init(); X.cpu_reset();
  S.step=function(){
    const C=Math.floor(10000000/60);
    X.cpu_run(C>>1); X.cpu_irq(5); X.cpu_run(200); X.cpu_irq(0);   // LD-V1000 status strobe
    X.cpu_run(C>>1); X.cpu_irq(4); X.cpu_run(200); X.cpu_irq(0);   // vblank
    if(ld.play){ ld.acc+=ld.speed4; while(ld.acc>=8){ ld.acc-=8; ld.frame++; } }
    S.frame++;
  };
  S.reset=function(){ X.cpu_reset(); };
  return S;
}
// Video (from the real attract / warp-select / copyright screens):
//  * text layer 0x880000: 32x32 tilemap (row = 32 words), 2bpp tiles from A44-09..12, index w&7FF,
//    bit15=0 -> A44-09 (b0) + A44-11 (b1), bit15=1 -> A44-10 + A44-12, palette (w>>12)&7 x4, bit11 unused here. pen 0 transparent.
//  * palette words are xxxxBBBBGGGGRRRR.
//  * 0x840000 is banked by 0x480000 (4 x 4KB). Bank 2 holds 32 sprite "blocks" of 8x8 tiles (64 words, row-major).
//    Block tiles are 4bpp A44-15..18, index w&7FF, palette 0x200 + (w>>12)*16. pen 0 transparent.
//  * sprites 0x800000: 128 x 32 bytes, 8-bit regs on odd addresses:
//    r0 = b7 enable | b2-6 height | b1 flip? | b0 Y bit8, r1 = Y, r5 = block, r6 = b2-7 width | b1 | b0 X bit8, r7 = X
function SBYVideo(tilesA, tilesB){
  const V={layers:{tm0:true,tm1:true}};
  function decB(planes){ const t=new Uint8Array(2048*64);
    for(let n=0;n<2048;n++) for(let y=0;y<8;y++) for(let k=0;k<4;k++){ const b=planes[k][n*8+y]; for(let x=0;x<8;x++) if(b&(0x80>>x)) t[n*64+y*8+x]|=1<<k; } return t; }
  function decA(r9,r10,r11,r12){ const t=new Uint8Array(4096*64);
    for(let n=0;n<4096;n++){ const lo=n<2048?r9:r10, hi=n<2048?r11:r12, m=n&2047;
      for(let y=0;y<8;y++){ const b0=lo[m*8+y], b1=hi[m*8+y]; for(let x=0;x<8;x++){ const msk=0x80>>x; t[n*64+y*8+x]=((b0&msk)?1:0)|((b1&msk)?2:0); } } }
    return t; }
  const A=decA(tilesA[0],tilesA[1],tilesA[2],tilesA[3]), B=decB(tilesB); V.A=A; V.B=B;
  const pal32=new Uint32Array(0x400);
  V.textPage=0;
  function drawText(tm,out){
    const base0=V.textPage*1024;
    for(let ty=0;ty<30;ty++) for(let tx=0;tx<32;tx++){
      const w=tm[base0+ty*32+tx]; if(!w) continue;
      let T,base,col;
      // text layer = 2bpp tiles from A44-09..12: bit15 selects the ROM pair, palette = (w>>11)&15 (x4)
      T=A; base=(((w&0x8000)?0x800:0)|(w&0x7FF))*64; col=((w>>12)&7)*4;
      for(let y=0;y<8;y++){ const row=(ty*8+y)*256+tx*8; for(let x=0;x<8;x++){ const v=T[base+y*8+x]; if(v) out[row+x]=pal32[col+v]; } }
    } }
  function drawSprites(m,out){
    const spr=m.mem.spr, blk=m.mem.vramA[2];
    for(let i=127;i>=0;i--){
      const r=(k)=>spr[i*16+k]&0xFF;
      const r0=r(0); if(!(r0&0x80)) continue;
      const y=((r0&1)<<8)|r(1), x=((r(6)&1)<<8)|r(7), b=r(5)&31;
      for(let ty=0;ty<8;ty++) for(let tx=0;tx<8;tx++){
        const w=blk[b*64+ty*8+tx]; if(!w) continue;
        const base=(w&0x7FF)*64, col=0x200+((w>>12)&15)*16;
        for(let yy=0;yy<8;yy++){ const Y=y+ty*8+yy; if(Y<0||Y>=240) continue;
          for(let xx=0;xx<8;xx++){ const X=x+tx*8+xx; if(X<0||X>=256) continue; const v=B[base+yy*8+xx]; if(v) out[Y*256+X]=pal32[(col+v)&0x3FF]; } }
      }
    } }
  V.render=function(m,out){
    const p=m.mem.pal;
    for(let i=0;i<0x400;i++){ const c=p[i], b=((c>>8)&15)*17, g=((c>>4)&15)*17, r=(c&15)*17; pal32[i]=(255<<24)|(b<<16)|(g<<8)|r; }
    out.fill(0);
    if(V.layers.tm0) drawSprites(m,out);
    if(V.layers.tm1) drawText(m.mem.tm1,out);
  };
  return V;
}


// Star Blazers sound board: Z80 + 2x YM2203 (C800/C801, CC00/CC01) + command latch D800 + DAC D803
function SBYSound(Z80, z80rom, ymBytes, rate){
  const S={rate, cmdlog:[], regs:{}};
  const wasi={fd_close:()=>0,fd_seek:()=>0,fd_write:()=>0,proc_exit:()=>{}};
  const Y=new WebAssembly.Instance(new WebAssembly.Module(ymBytes),{wasi_snapshot_preview1:wasi}).exports;
  Y.yinit(3000000, rate); S.Y=Y;
  const rom=z80rom, ram=new Uint8Array(0x800);
  let latch=0, reply=0, replyFull=false, cmdFull=false, dac=0x80;
  const dacEv=[];   // [cycle, value] within current slice
  const core={
    mem_read(a){ if(a<0x8000) return rom[a]; if(a>=0xC000&&a<0xC800) return ram[a-0xC000];
      if((a&0xFC00)==0xC800) return Y.yread(0,a&1); if((a&0xFC00)==0xCC00) return Y.yread(1,a&1);
      if(a==0xD800){ cmdFull=false; return latch; } if(a==0xD801) return (cmdFull?1:0)|(replyFull?2:0);
      return 0xFF; },
    mem_write(a,v){ if(a>=0xC000&&a<0xC800){ ram[a-0xC000]=v; return; }
      if((a&0xFC00)==0xC800){ Y.ywrite(0,a&1,v); return; } if((a&0xFC00)==0xCC00){ Y.ywrite(1,a&1,v); return; }
      if(a==0xD800){ reply=v; replyFull=true; return; }
      if(a==0xD803){ dacEv.push([cyc,v]); return; }
      S.regs[a.toString(16)]=v; },
    io_read(p){ return 0xFF; }, io_write(p,v){} };
  const cpu=new Z80(core); let cyc=0;
  S.command=function(v){ latch=v; cmdFull=true; S.cmdlog.push(v); if(S.cmdlog.length>32) S.cmdlog.shift(); cpu.interrupt(true,0); };
  S.readReply=function(){ replyFull=false; return reply; };
  // run one 60 Hz frame; returns Float32Array of rate/60 samples
  const CPF=Math.floor(4000000/60), NS=Math.round(rate/60), SL=8;
  const outBuf=new Float32Array(NS); let hpX=0, hpY=0;
  S.frame=function(){
    let o=0;
    for(let s=0;s<SL;s++){
      cyc=0; dacEv.length=0; const target=CPF/SL;
      while(cyc<target){ cyc+=cpu.run_instruction(); if(Y.yirq()) cpu.interrupt(false,0xFF); }
      const n=Math.round(NS*(s+1)/SL)-o; Y.yrender(n);
      const yb=new Float32Array(Y.memory.buffer,Y.ybuf(),n);
      let e=0;
      for(let i=0;i<n;i++){ const c=i/n*target; while(e<dacEv.length && dacEv[e][0]<=c){ dac=dacEv[e][1]; e++; } const x=yb[i]+(dac-0x80)/128*0.25; hpY=x-hpX+0.997*hpY; hpX=x; outBuf[o+i]=Math.max(-1,Math.min(1,hpY*1.6)); }
      while(e<dacEv.length){ dac=dacEv[e][1]; e++; }
      o+=n;
    }
    return outBuf;
  };
  return S;
}


return { Z80, SBYMachine, SBYVideo, SBYSound };
})();

/* ==========================================================================
 *  Star Blazers / Space Battleship Yamato (Taito / West Cape 1985) — nativo.
 *  Núcleo de Luis (set sbyamato): 68000 (Musashi en WebAssembly) a 10 MHz,
 *  capa de texto 32×32 2 bpp (A44-09..12), sprites por bloques de 8×8 tiles
 *  4 bpp (A44-15..18), paleta xxxxBBBBGGGGRRRR, LD-V1000 por 620000/720000
 *  (el juego manda cada comando dos veces), sonido Z80 + 2× YM2203 + DAC.
 * ========================================================================== */
async function drvYamato(lib, set, env) {
  const res = { missing: [], loaded: [] };
  if (typeof window === 'undefined' || !window.SBY_WASM) throw new Error('Falta data/sby_core.js (núcleos WASM de Yamato)');
  const R = {};
  const pick = async n => {
    let r = (lib.sets[set] || []).find(x => x.name.startsWith('a44-' + n + '.'));
    if (!r) for (const k in lib.sets) { r = lib.sets[k].find(x => x.name.startsWith('a44-' + n + '.')); if (r) break; }
    if (!r) { res.missing.push('A44-' + n); return new Uint8Array(0x4000); }
    res.loaded.push(r.name); return await lib.get(r);
  };
  for (const n of ['01', '02', '03', '04', '05', '06', '09', '10', '11', '12', '15', '16', '17', '18', '19', '20']) R[n] = await pick(n);
  const il = (a, b) => { const o = new Uint8Array(a.length * 2); for (let i = 0; i < a.length; i++) { o[2 * i] = a[i]; o[2 * i + 1] = b[i]; } return o; };
  const prg = new Uint8Array(0x18000);
  prg.set(il(R['01'], R['04']), 0); prg.set(il(R['02'], R['05']), 0x8000); prg.set(il(R['03'], R['06']), 0x10000);
  const b64 = s => { const b = atob(s), u = new Uint8Array(b.length); for (let i = 0; i < b.length; i++) u[i] = b.charCodeAt(i); return u; };
  const sr = env.sampleRate || 44100;
  const m = SBYCORE.SBYMachine(b64(window.SBY_WASM), prg);
  const V = SBYCORE.SBYVideo(['09', '10', '11', '12'].map(n => R[n]), ['15', '16', '17', '18'].map(n => R[n]));
  const zr = new Uint8Array(0x8000); zr.set(R['19'], 0); zr.set(R['20'], 0x4000);
  const snd = SBYCORE.SBYSound(SBYCORE.Z80, zr, b64(window.SBY_YM), sr);
  m.onSound = v => snd.command(v); m.onSoundRead = () => snd.readReply();
  const ld = m.ld;
  const ldp = {
    get frame() { return ld.frame; }, get frac() { return ld.acc / 8; },
    get status() { return ld.search ? LDP_SEARCHING : (ld.play && ld.speed4) ? LDP_PLAYING : LDP_PAUSED; },
    get target() { return ld.frame; }, fps: 29.97, get speedNum() { return ld.speed4 || 4; }, speedDen: 4,
    audio1: true, audio2: true, squelchSearch: true, log: []
  };
  const hold = { coin: 0, start: 0, fire: false, up: false, down: false, left: false, right: false, test: false };
  let ptr = null; const aq = [];
  const crosshair = () => { const r = new Uint8Array(m.X.memory.buffer, m.X.ram_ptr(), 0x4000); return { y: (r[0x234] << 8) | r[0x235], x: (r[0x236] << 8) | r[0x237] }; };
  let field = 0;
  const G = {
    name: set, fps: 29.97, ldp, res, ow: 256, oh: 240, players: 1, analog: true,
    get videoBlank() { return false; },
    runField() {
      let in0 = 0xFFFF, in2 = 0xFFFF;
      if (hold.coin > 0) { in2 &= ~0x01; hold.coin--; }
      if (hold.start > 0) { in2 &= ~0x04; hold.start--; }
      if (hold.test) in2 &= ~0x02;
      let up = hold.up, down = hold.down, left = hold.left, right = hold.right;
      if (ptr) { const c = crosshair(), dx = ptr.x - (c.x + 12), dy = ptr.y - (c.y + 12), dead = 3;   /* la mira va hacia el puntero */
        if (dx < -dead) left = true; else if (dx > dead) right = true; if (dy < -dead) up = true; else if (dy > dead) down = true; }
      if (up) in0 &= ~0x20; if (down) in0 &= ~0x80; if (left) in0 &= ~0x10; if (right) in0 &= ~0x40;
      if (hold.fire) in0 &= ~0x04;
      m.inp.in0 = in0; m.inp.in2 = in2;
      m.step();
      const a = snd.frame(); if (aq.length < sr) for (let i = 0; i < a.length; i++) aq.push(a[i]);
    },
    analog(x, y) { ptr = { x, y }; },
    input(sw, d) {
      switch (sw) {
        case SW.UP: hold.up = d; ptr = null; break; case SW.DOWN: hold.down = d; ptr = null; break;
        case SW.LEFT: hold.left = d; ptr = null; break; case SW.RIGHT: hold.right = d; ptr = null; break;
        case SW.BUTTON1: hold.fire = d; break;
        case SW.COIN1: case SW.COIN2: if (d) hold.coin = 8; break;
        case SW.START1: if (d) hold.start = 8; break;
        case SW.TEST: hold.test = d; break;
      }
    },
    gamepad(seat, gp, prev) {
      if (seat) return; const bt = n => !!(gp.buttons[n] && gp.buttons[n].pressed);
      const ax = gp.axes[0] || 0, ay = gp.axes[1] || 0;
      hold.left = bt(14) || ax < -0.4; hold.right = bt(15) || ax > 0.4; hold.up = bt(12) || ay < -0.4; hold.down = bt(13) || ay > 0.4;
      if (hold.left || hold.right || hold.up || hold.down) ptr = null;
      hold.fire = bt(0) || bt(7);
      if (bt(8) && !(prev && prev[8])) hold.coin = 8; if (bt(9) && !(prev && prev[9])) hold.start = 8;
    },
    draw(buf) { V.render(m, buf); },
    sample() { return aq.length ? aq.shift() : 0; },
    status() { return '68000 · LD-V1000 ' + ld.out.toString(16) + ' cuadro ' + ld.frame + ' ×' + (ld.play ? ld.speed4 / 4 : 0).toFixed(2); }
  };
  return G;
}
DRIVERS.sbyamato = drvYamato;
