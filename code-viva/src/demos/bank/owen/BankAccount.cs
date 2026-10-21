using System;
using System.Collections.Generic;

public class BankAccount
{
    public decimal Balance;
    public List<string> h = new List<string>();

    public void Deposit(decimal a)
    {
        if (a <= 0) throw new ArgumentOutOfRangeException();
        Balance = Balance + a;
        h.Add("d " + a);
    }

    public void Withdraw(decimal a)
    {
        if (a <= 0) throw new ArgumentOutOfRangeException();
        if (Balance - a < 0) throw new InvalidOperationException();
        Balance = Balance - a;
        h.Add("w " + a);
    }

    public void Transfer(BankAccount x, decimal a)
    {
        Withdraw(a);
        x.Deposit(a);
    }
}
